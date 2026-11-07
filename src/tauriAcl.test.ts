/**
 * Garde ACL (revue QA, QA-01) : chaque commande Tauri appelée depuis src/ doit être autorisée par
 * src-tauri/capabilities/default.json. Sans elle, le bouton échoue en production seulement
 * (c'est ainsi que sauvegarde et restauration ont été cassées depuis le premier commit).
 * Vérifie aussi la surface : pas de permission fs, CSP posée (M6).
 */
import { describe, expect, it } from 'vitest';
import buildRs from '../src-tauri/build.rs?raw';
import libRs from '../src-tauri/src/lib.rs?raw';
import commandsRs from '../src-tauri/src/commands.rs?raw';
import capabilitiesRaw from '../src-tauri/capabilities/default.json?raw';
import tauriConfRaw from '../src-tauri/tauri.conf.json?raw';

const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Généré par `cargo build` (gitignoré) : absent en CI avant les tests Rust, présent en local.
const ACL_MANIFESTS = Object.values(
  import.meta.glob<string>('../src-tauri/gen/schemas/acl-manifests.json', { query: '?raw', import: 'default', eager: true })
);

/** API JS de plugin -> commande `plugin|commande` exigée. Toute API absente de cette table fait échouer la garde. */
const API_COMMANDS: Record<string, Record<string, string[]>> = {
  '@tauri-apps/plugin-sql': { default: ['sql|load', 'sql|select', 'sql|execute'] },
  '@tauri-apps/plugin-updater': { check: ['updater|check'], Update: [] },
  '@tauri-apps/plugin-process': { relaunch: ['process|restart'], exit: ['process|exit'] },
  '@tauri-apps/api/app': { getVersion: ['core:app|version'] },
  '@tauri-apps/api/core': { invoke: [] }, // commandes de l'app, contrôlées à part
};
/** Méthodes d'objets renvoyés par les plugins. */
const METHOD_COMMANDS: { pattern: RegExp; command: string; module: string }[] = [
  { pattern: /\.downloadAndInstall\(/, command: 'updater|download_and_install', module: '@tauri-apps/plugin-updater' },
  { pattern: /\.download\(/, command: 'updater|download', module: '@tauri-apps/plugin-updater' },
  { pattern: /\.install\(/, command: 'updater|install', module: '@tauri-apps/plugin-updater' },
  { pattern: /\bdb\.close\(|Database[^;]*\.close\(/, command: 'sql|close', module: '@tauri-apps/plugin-sql' },
];

/** Contenu des jeux de permissions utilisés (vérifié contre acl-manifests.json quand il existe). */
const KNOWN_SETS: Record<string, string[]> = {
  'updater:default': ['allow-check', 'allow-download', 'allow-install', 'allow-download-and-install'],
  'process:default': ['allow-exit', 'allow-restart'],
  'core:app:default': ['allow-version', 'allow-name', 'allow-tauri-version', 'allow-identifier', 'allow-bundle-type', 'allow-register-listener', 'allow-remove-listener', 'allow-supports-multiple-windows'],
};

type Capability = { permissions: (string | { identifier: string })[] };
const capabilities = JSON.parse(capabilitiesRaw) as Capability;
const permissionIds = capabilities.permissions.map((p) => (typeof p === 'string' ? p : p.identifier));

const kebabToSnake = (s: string): string => s.replace(/-/g, '_');

/** `plugin:allow-x` -> `plugin|x` ; `core:default` couvre `core:app:default`. */
const grantedCommands = (): Set<string> => {
  const ids = permissionIds.flatMap((id) => (id === 'core:default' ? [id, 'core:app:default'] : [id]));
  const granted = new Set<string>();
  for (const id of ids) {
    const sep = id.lastIndexOf(':');
    if (sep === -1) continue; // permission de l'app, traitée à part
    const plugin = id.slice(0, sep);
    const name = id.slice(sep + 1);
    const allows = name === 'default' ? KNOWN_SETS[id] ?? [] : [name];
    allows.filter((a) => a.startsWith('allow-')).forEach((a) => granted.add(`${plugin}|${kebabToSnake(a.slice(6))}`));
  }
  return granted;
};

const importsOf = (src: string): { module: string; names: string[] }[] =>
  [...src.matchAll(/import\s+(?:type\s+)?([^'";]+?)\s+from\s+'(@tauri-apps\/[^']+)'/g)]
    .filter((m) => !m[0].startsWith('import type'))
    .map((m) => {
      const clause = m[1];
      const named = /\{([^}]*)\}/.exec(clause)?.[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) ?? [];
      const hasDefault = /^\s*[A-Za-z_$][\w$]*\s*(,|$)/.test(clause);
      return { module: m[2], names: [...(hasDefault ? ['default'] : []), ...named] };
    });

describe('garde ACL Tauri', () => {
  const sources = Object.entries(SOURCES);

  it('lit bien les sources du front', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it('la garde n’est pas vide : elle voit les imports et les permissions réels', () => {
    const modules = sources.flatMap(([, src]) => importsOf(src).map((i) => `${i.module}:${i.names.join(',')}`));
    expect(modules).toEqual(expect.arrayContaining([
      '@tauri-apps/plugin-sql:default',
      '@tauri-apps/plugin-updater:check,Update',
      '@tauri-apps/plugin-process:relaunch',
      '@tauri-apps/api/app:getVersion',
    ]));
    const granted = grantedCommands();
    ['sql|load', 'sql|select', 'sql|execute', 'updater|download_and_install', 'process|restart', 'core:app|version']
      .forEach((c) => expect(granted.has(c), c).toBe(true));
    expect(granted.has('sql|close')).toBe(false); // le front ne ferme plus la base (restauration côté Rust)
  });

  it('chaque API de plugin utilisée dans src/ a sa permission', () => {
    const granted = grantedCommands();
    const missing: string[] = [];
    for (const [file, src] of sources) {
      for (const { module, names } of importsOf(src)) {
        const table = API_COMMANDS[module];
        if (!table) {
          missing.push(`${file} : module ${module} non répertorié dans la garde`);
          continue;
        }
        for (const name of names) {
          const required = table[name];
          if (!required) missing.push(`${file} : ${module}.${name} non répertorié dans la garde`);
          else required.filter((c) => !granted.has(c)).forEach((c) => missing.push(`${file} : ${c} non autorisé`));
        }
      }
      for (const { pattern, command, module } of METHOD_COMMANDS) {
        if (src.includes(module) || (module.endsWith('plugin-sql') && src.includes("from './db'"))) {
          if (pattern.test(src) && !granted.has(command)) missing.push(`${file} : ${command} non autorisé`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('chaque commande de l’app invoquée est déclarée, enregistrée et autorisée', () => {
    const invoked = new Set(
      sources.flatMap(([, src]) => [...src.matchAll(/\b(?:invoke|call)(?:<[^>]*>)?\(\s*'([a-z_]+)'/g)].map((m) => m[1]))
    );
    expect(invoked.size).toBeGreaterThan(0);
    const declared = [...buildRs.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const handlerBlock = /generate_handler!\[([\s\S]*?)\]/.exec(libRs)?.[1] ?? '';
    const problems = [...invoked].flatMap((cmd) => [
      ...(declared.includes(cmd) ? [] : [`${cmd} absent de build.rs (APP_COMMANDS)`]),
      ...(handlerBlock.includes(`commands::${cmd}`) ? [] : [`${cmd} absent de generate_handler!`]),
      ...(new RegExp(`#\\[tauri::command\\]\\s*pub async fn ${cmd}\\b`).test(commandsRs) ? [] : [`${cmd} sans #[tauri::command]`]),
      ...(permissionIds.includes(`allow-${cmd.replace(/_/g, '-')}`) ? [] : [`allow-${cmd.replace(/_/g, '-')} absent des capabilities`]),
    ]);
    expect(problems).toEqual([]);
  });

  it('aucune permission fs ni portée $HOME (M6)', () => {
    expect(permissionIds.filter((id) => id.startsWith('fs:'))).toEqual([]);
    expect(capabilitiesRaw).not.toMatch(/\$HOME/);
  });

  it('CSP stricte posée, IPC autorisé (M6, R3)', () => {
    const conf = JSON.parse(tauriConfRaw) as { app: { security: { csp: string | null } } };
    const csp = conf.app.security.csp ?? '';
    const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('connect-src')).toMatch(/ipc: http:\/\/ipc\.localhost/);
  });

  it.skipIf(ACL_MANIFESTS.length === 0)('la table des jeux de permissions correspond aux manifestes générés', () => {
    const manifests = JSON.parse(ACL_MANIFESTS[0]) as Record<string, { default_permission?: { permissions: string[] } }>;
    for (const [setId, expected] of Object.entries(KNOWN_SETS)) {
      const plugin = setId.slice(0, setId.lastIndexOf(':'));
      expect(manifests[plugin]?.default_permission?.permissions, setId).toEqual(expected);
    }
  });
});
