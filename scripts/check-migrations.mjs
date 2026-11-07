#!/usr/bin/env node
// Garde-fou : une release ne doit jamais casser les bases déjà migrées sur le parc.
// Usage : node scripts/check-migrations.mjs [tag_publié] [--head-file chemin/lib.rs]
//   tag_publié : tag de la dernière release publiée. En CI, passé depuis l'API GitHub
//                (releases/latest). Sinon : variable BASE_TAG, sinon le plus haut tag stable vX.Y.Z
//                qui ne pointe pas sur HEAD. `git describe` n'est pas utilisé : il renvoie par
//                construction un ancêtre de HEAD (le contrôle d'ascendance deviendrait vide) et,
//                sur un build de tag, le tag lui-même.
//   --head-file : compare un fichier lib.rs donné au lieu de celui de HEAD (tests).
// Échoue si : le tag publié n'est pas ancêtre de HEAD, une migration publiée manque, son SQL ou
// son kind a changé (comparaison exacte), ou une nouvelle migration a une version trop basse.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseMigrations, parseStringConsts, compareMigrations } from './lib/migrations.mjs';
import { parseSemver, compareSemver } from './lib/semver.mjs';
import { git, gitSucceeds, showFile, ciError, ciWarning } from './lib/git.mjs';

const LIB_RS = 'src-tauri/src/lib.rs';
// Le SQL des migrations peut vivre dans des constantes de schema.rs (sql: schema::NOM).
const SCHEMA_RS = 'src-tauri/src/schema.rs';

const constsAt = (ref) =>
  gitSucceeds(['cat-file', '-e', `${ref}:${SCHEMA_RS}`]) ? parseStringConsts(showFile(ref, SCHEMA_RS)) : {};

const constsFromFile = (path) => (existsSync(path) ? parseStringConsts(readFileSync(path, 'utf8')) : {});

const parseArgs = (argv) => {
  const headFileIndex = argv.indexOf('--head-file');
  const headFile = headFileIndex === -1 ? null : argv[headFileIndex + 1];
  if (headFileIndex !== -1 && !headFile) throw new Error('--head-file attend un chemin');
  const isHeadFileValue = (i) => headFileIndex !== -1 && i === headFileIndex + 1;
  const positional = argv.filter((arg, i) => !arg.startsWith('--') && !isHeadFileValue(i));
  return { baseTag: positional[0] || process.env.BASE_TAG || null, headFile };
};

const defaultBaseTag = () => {
  const headSha = git(['rev-parse', 'HEAD']);
  const tags = git(['tag', '--list', 'v[0-9]*']).split('\n').filter(Boolean);
  const stable = tags
    .filter((tag) => parseSemver(tag)?.pre.length === 0)
    .filter((tag) => git(['rev-list', '-n', '1', tag]) !== headSha)
    .sort(compareSemver);
  if (stable.length === 0) throw new Error('aucun tag de release vX.Y.Z trouvé (checkout avec fetch-depth: 0 ?)');
  return stable[stable.length - 1];
};

const main = () => {
  const { baseTag: requested, headFile } = parseArgs(process.argv.slice(2));
  const baseTag = requested || defaultBaseTag();
  if (!gitSucceeds(['rev-parse', '--verify', '--quiet', `${baseTag}^{commit}`])) {
    throw new Error(`tag ${baseTag} introuvable localement (git fetch --tags ?)`);
  }

  const errors = [];
  if (!gitSucceeds(['merge-base', '--is-ancestor', baseTag, 'HEAD'])) {
    errors.push(`${baseTag} (release publiée) n'est pas ancêtre de HEAD : la ligne en service a été perdue`);
  }

  const published = parseMigrations(showFile(baseTag, LIB_RS), constsAt(baseTag));
  const current = headFile
    ? parseMigrations(readFileSync(headFile, 'utf8'), constsFromFile(join(dirname(headFile), 'schema.rs')))
    : parseMigrations(showFile('HEAD', LIB_RS), constsAt('HEAD'));
  const result = compareMigrations(published, current);
  result.warnings.forEach(ciWarning);
  const allErrors = [...errors, ...result.errors];
  allErrors.forEach(ciError);

  const source = headFile ?? `HEAD:${LIB_RS}`;
  console.log(`Base ${baseTag} : ${published.length} migrations ; ${source} : ${current.length} migrations.`);
  if (allErrors.length > 0) { console.error(`check-migrations : ÉCHEC (${allErrors.length} erreur(s)).`); return 1; }
  console.log('check-migrations : OK, migrations publiées intactes et historique continu.');
  return 0;
};

try {
  process.exitCode = main();
} catch (error) {
  ciError(`check-migrations : ${error.message}`);
  process.exitCode = 1;
}
