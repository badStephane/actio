// Tests des garde-fous de release. Lancer : node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMigrations, parseStringConsts, compareMigrations } from './lib/migrations.mjs';
import { compareSemver, isPrerelease } from './lib/semver.mjs';
import { checkReleaseVersion } from './check-release-version.mjs';

const block = (version, sql, extra = '') => `
    Migration {
      version: ${version},
      description: "m${version}",
      sql: "${sql}",${extra}
      kind: MigrationKind::Up,
    },`;
const libRs = (...blocks) => `use tauri_plugin_sql::{Migration, MigrationKind};\nlet migrations = vec![${blocks.join('')}\n];`;

const PUBLISHED = parseMigrations(libRs(block(1, 'CREATE TABLE a (id TEXT);'), block(2, 'ALTER TABLE a ADD COLUMN b TEXT;')));

test('parseMigrations extrait version, sql brut et kind', () => {
  const parsed = parseMigrations(libRs(block(7, 'SELECT \\"x\\";\n            SELECT 2;')));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].version, 7);
  assert.equal(parsed[0].sql, 'SELECT \\"x\\";\n            SELECT 2;');
  assert.equal(parsed[0].kind, 'Up');
});

test('parseMigrations lit les littéraux bruts r#"..."#', () => {
  const src = 'Migration { version: 3, description: "d", sql: r#"SELECT "q";"#, kind: MigrationKind::Up }';
  assert.equal(parseMigrations(src)[0].sql, 'SELECT "q";');
});

test('parseMigrations résout sql: schema::NOM via les constantes &str, et échoue si inconnue', () => {
  const schema = 'pub const MIGRATION_3: &str = "CREATE TABLE c (id TEXT);\nSELECT 3;";';
  const src = libRs(block(1, 'SELECT 1;')).replace('"SELECT 1;"', 'schema::MIGRATION_3');
  assert.equal(parseMigrations(src, parseStringConsts(schema))[0].sql, 'CREATE TABLE c (id TEXT);\nSELECT 3;');
  assert.throws(() => parseMigrations(src), /ni un littéral ni une constante/);
});

test('compareMigrations accepte un ajout de migration', () => {
  const current = parseMigrations(libRs(block(1, 'CREATE TABLE a (id TEXT);'), block(2, 'ALTER TABLE a ADD COLUMN b TEXT;'), block(3, 'SELECT 1;')));
  assert.deepEqual(compareMigrations(PUBLISHED, current).errors, []);
});

test('compareMigrations échoue si une migration publiée manque', () => {
  const current = parseMigrations(libRs(block(1, 'CREATE TABLE a (id TEXT);')));
  assert.match(compareMigrations(PUBLISHED, current).errors.join('\n'), /2 .*absente/);
});

test('compareMigrations échoue sur un changement d espaces seulement', () => {
  const current = parseMigrations(libRs(block(1, 'CREATE TABLE a  (id TEXT);'), block(2, 'ALTER TABLE a ADD COLUMN b TEXT;')));
  assert.match(compareMigrations(PUBLISHED, current).errors.join('\n'), /espaces seulement/);
});

test('compareMigrations échoue sur version dupliquée ou trop basse', () => {
  const dup = parseMigrations(libRs(block(1, 'CREATE TABLE a (id TEXT);'), block(2, 'ALTER TABLE a ADD COLUMN b TEXT;'), block(2, 'SELECT 1;')));
  assert.match(compareMigrations(PUBLISHED, dup).errors.join('\n'), /plusieurs fois/);
  const published = parseMigrations(libRs(block(1, 'CREATE TABLE a (id TEXT);'), block(3, 'SELECT 3;'), block(4, 'SELECT 4;')));
  const withLow = parseMigrations(libRs(block(1, 'CREATE TABLE a (id TEXT);'), block(2, 'SELECT 2;'), block(3, 'SELECT 3;'), block(4, 'SELECT 4;')));
  assert.match(compareMigrations(published, withLow).errors.join('\n'), /inférieure à la dernière publiée/);
});

test('compareSemver ordonne les pre-releases avant la version finale', () => {
  assert.equal(compareSemver('v2.1.0-rc.1', 'v2.0.2'), 1);
  assert.equal(compareSemver('v2.1.0-rc.1', 'v2.1.0'), -1);
  assert.equal(compareSemver('v2.1.0-rc.10', 'v2.1.0-rc.2'), 1);
  assert.equal(compareSemver('v2.0.2', 'v2.0.2'), 0);
  assert.equal(isPrerelease('v2.1.0-rc.1'), true);
});

test('checkReleaseVersion exige un bump commité et une version supérieure', () => {
  const ok = checkReleaseVersion({ tag: 'v2.1.0', publishedTag: 'v2.0.2', fileVersions: { 'a.json': '2.1.0' } });
  assert.deepEqual(ok, []);
  const notBumped = checkReleaseVersion({ tag: 'v2.1.0', publishedTag: 'v2.0.2', fileVersions: { 'a.json': '0.1.4' } });
  assert.match(notBumped.join('\n'), /commiter le bump/);
  const notGreater = checkReleaseVersion({ tag: 'v2.0.2', publishedTag: 'v2.0.2', fileVersions: { 'a.json': '2.0.2' } });
  assert.match(notGreater.join('\n'), /pas supérieur/);
});
