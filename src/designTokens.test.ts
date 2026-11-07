/**
 * Garde des tokens design après Tailwind 4 (QA P7, 2.2.0) : les valeurs de l'ancien
 * tailwind.config.js (v3) et les hex de la palette v3 portent les contrastes calculés du plan
 * design (02-design-ux.md §2). Une montée de version ou un `@tailwindcss/upgrade` relancé ne doit
 * pas les déplacer sans décision design.
 */
import { describe, expect, it } from 'vitest';

// Vitest ne traite pas le CSS (`index.css?raw` vaut ''). Lecture par fs via getBuiltinModule (Node >= 22.3),
// sans `types: node` dans tsconfig.app : le code navigateur ne doit pas voir les globales Node.
type NodeFs = { readFileSync(path: URL, encoding: 'utf8'): string };
const nodeProcess = (globalThis as unknown as { process: { getBuiltinModule(id: string): NodeFs } }).process;
const CSS = nodeProcess.getBuiltinModule('node:fs').readFileSync(new URL('./index.css', import.meta.url), 'utf8');

const themeValue = (name: string): string | undefined =>
  CSS.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim().toLowerCase();

// Valeurs exactes de tailwind.config.js sur main (2.1.0-rc.2).
const V3_COLORS: Record<string, string> = {
  'brand-50': '#eef4fb', 'brand-100': '#d9e6f6', 'brand-400': '#6a9dda', 'brand-500': '#4b85cd',
  'brand-600': '#2563b8', 'brand-700': '#1e4f94', 'brand-900': '#192a49',
  ink: '#111827', 'ink-soft': '#374151', 'ink-muted': '#4b5563',
  surface: '#ffffff', 'surface-app': '#f3f4f6', 'surface-subtle': '#f9fafb', 'surface-line': '#d1d5db',
  cash: '#047857', 'cash-fill': '#059669', 'cash-soft': '#d1fae5', 'cash-ink': '#065f46',
  wave: '#0369a1', 'wave-fill': '#0284c7', 'wave-soft': '#e0f2fe', 'wave-ink': '#075985',
  om: '#c2410c', 'om-fill': '#ea580c', 'om-soft': '#ffedd5', 'om-ink': '#9a3412',
  danger: '#b91c1c', 'danger-soft': '#fef2f2', 'danger-line': '#fca5a5',
  warning: '#92400e', 'warning-soft': '#fffbeb', 'warning-line': '#fcd34d',
  success: '#065f46', 'success-soft': '#ecfdf5', 'success-line': '#6ee7b7',
};

// Teintes v3 dont dépendent les contrastes cités dans le code (m7, U10, boutons, badges).
const V3_PALETTE: Record<string, string> = {
  'gray-200': '#e5e7eb', 'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563',
  'amber-700': '#b45309', 'amber-800': '#92400e', 'emerald-700': '#047857', 'emerald-800': '#065f46',
  'red-700': '#b91c1c', 'red-800': '#991b1b', 'slate-300': '#cbd5e1',
};

describe('tokens design en Tailwind 4 (2.2.0)', () => {
  it.each(Object.entries(V3_COLORS))('couleur %s = %s, comme en v3', (name, hex) => {
    expect(themeValue(`color-${name}`)).toBe(hex);
  });

  it.each(Object.entries(V3_PALETTE))('palette v3 figée : %s = %s (pas l’oklch v4)', (name, hex) => {
    expect(themeValue(`color-${name}`)).toBe(hex);
  });

  it('rayons, ombres, hauteurs de contrôle et durées identiques à la v3', () => {
    expect(themeValue('radius-control')).toBe('6px');
    expect(themeValue('radius-card')).toBe('8px');
    expect(themeValue('shadow-card')).toBe('0 1px 2px 0 rgb(17 24 39 / 0.06)');
    expect(themeValue('shadow-pop')).toBe('0 10px 30px -5px rgb(17 24 39 / 0.25)');
    expect(themeValue('height-control')).toBe('2.25rem');
    expect(themeValue('height-control-lg')).toBe('2.75rem');
    expect(themeValue('transition-duration-fast')).toBe('120ms');
    expect(themeValue('transition-duration-base')).toBe('200ms');
  });

  it('variante short: = écrans bas (max-height 699px), sources limitées à index.html et src', () => {
    expect(CSS).toContain('@custom-variant short (@media (max-height: 699px));');
    expect(CSS).toMatch(/@import 'tailwindcss' source\(none\);/);
    expect(CSS).toContain("@source '../index.html';");
    expect(CSS).toContain("@source '../src';");
  });

  it('anneau de focus U23 et compatibilité v3 (bordure gray-200, curseur main) conservés', () => {
    expect(CSS).toMatch(/\*:focus-visible \{\s*@apply outline-hidden ring-2 ring-brand-600 ring-offset-2 ring-offset-white;/);
    expect(CSS).toContain('border-color: var(--color-gray-200, currentcolor);');
    expect(CSS).toMatch(/button:not\(:disabled\),\s*\[role='button'\]:not\(:disabled\) \{\s*cursor: pointer;/);
  });
});
