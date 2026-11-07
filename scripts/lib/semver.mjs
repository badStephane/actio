// Comparaison semver minimale (MAJEUR.MINEUR.CORRECTIF[-prerelease]), sans dépendance.

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const parseSemver = (input) => {
  const match = SEMVER.exec(String(input).trim());
  if (!match) return null;
  const [, major, minor, patch, pre] = match;
  return Object.freeze({
    core: Object.freeze([Number(major), Number(minor), Number(patch)]),
    pre: pre ? Object.freeze(pre.split('.')) : Object.freeze([]),
  });
};

const compareIdentifiers = (a, b) => {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Math.sign(Number(a) - Number(b));
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

const comparePre = (a, b) => {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const diff = compareIdentifiers(a[i], b[i]);
    if (diff !== 0) return diff;
  }
  return Math.sign(a.length - b.length);
};

// -1, 0 ou 1. Lève une erreur si une version est invalide.
export const compareSemver = (left, right) => {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) throw new Error(`version semver invalide : ${!a ? left : right}`);
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) return Math.sign(a.core[i] - b.core[i]);
  }
  return comparePre(a.pre, b.pre);
};

export const isPrerelease = (version) => (parseSemver(version)?.pre.length ?? 0) > 0;
