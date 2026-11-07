#!/usr/bin/env node
// Garde-fou de version avant un build de release.
// Usage : node scripts/check-release-version.mjs <tag_à_publier> <tag_dernière_release_publiée>
// Échoue si : le tag n'est pas un semver vX.Y.Z[-pre], la version commitée dans
// src-tauri/tauri.conf.json ou package.json diffère du tag (on vérifie, on ne réécrit plus),
// ou la version n'est pas strictement supérieure à la dernière release publiée
// (l'updater ne propose jamais une version inférieure ou égale).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseSemver, compareSemver, isPrerelease } from './lib/semver.mjs';
import { ciError, ciWarning } from './lib/git.mjs';

const VERSION_FILES = Object.freeze(['src-tauri/tauri.conf.json', 'package.json']);

const readJsonVersion = (path) => JSON.parse(readFileSync(path, 'utf8')).version;

const readCargoVersion = () => {
  const match = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync('src-tauri/Cargo.toml', 'utf8'));
  return match ? match[1] : null;
};

export const checkReleaseVersion = ({ tag, publishedTag, fileVersions }) => {
  const errors = [];
  const version = tag.replace(/^v/, '');
  if (!parseSemver(tag) || !tag.startsWith('v')) return [`tag ${tag} invalide : attendu vX.Y.Z ou vX.Y.Z-rc.N`];
  for (const [path, found] of Object.entries(fileVersions)) {
    if (found !== version) errors.push(`${path} indique ${found}, le tag ${tag} : commiter le bump de version avant de taguer`);
  }
  if (!parseSemver(publishedTag)) errors.push(`dernière release publiée illisible : ${publishedTag}`);
  else if (compareSemver(tag, publishedTag) <= 0) errors.push(`${tag} n'est pas supérieur à la dernière release publiée ${publishedTag}`);
  return errors;
};

const main = () => {
  const [tag, publishedTag] = process.argv.slice(2);
  if (!tag || !publishedTag) throw new Error('usage : check-release-version.mjs <tag> <tag_publié>');
  const fileVersions = Object.fromEntries(VERSION_FILES.map((path) => [path, readJsonVersion(path)]));
  const cargo = readCargoVersion();
  if (cargo !== tag.replace(/^v/, '')) ciWarning(`src-tauri/Cargo.toml indique ${cargo} (sans effet sur l'app, à aligner)`);
  const errors = checkReleaseVersion({ tag, publishedTag, fileVersions });
  errors.forEach(ciError);
  if (errors.length > 0) return 1;
  console.log(`Version ${tag} OK (> ${publishedTag})${isPrerelease(tag) ? ', publiée en pre-release' : ''}.`);
  return 0;
};

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  try {
    process.exitCode = main();
  } catch (error) {
    ciError(`check-release-version : ${error.message}`);
    process.exitCode = 1;
  }
}
