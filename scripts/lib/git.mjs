// Appels git en lecture seule, sans shell (arguments passés en tableau).
import { execFileSync } from 'node:child_process';

export const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const gitSucceeds = (args) => {
  try { git(args); return true; } catch { return false; }
};

export const showFile = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

export const ciError = (message) => {
  console.error(process.env.GITHUB_ACTIONS ? `::error::${message}` : `ERREUR : ${message}`);
};

export const ciWarning = (message) => {
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `ATTENTION : ${message}`);
};
