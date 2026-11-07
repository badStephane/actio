// Extraction et comparaison des migrations SQL déclarées dans src-tauri/src/lib.rs.
// Sans dépendance. Le SQL est comparé au texte EXACT du littéral Rust : sqlx calcule
// un SHA-384 sur la chaîne exacte et refuse d'ouvrir une base si le SQL d'une migration
// déjà appliquée a changé (VersionMismatch), même d'un seul espace.

const MIGRATION_START = /\bMigration\s*\{/g;

const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

const skipTrivia = (src, start) => {
  let i = start;
  while (i < src.length) {
    if (isSpace(src[i]) || src[i] === ',') { i += 1; continue; }
    if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl + 1; continue; }
    if (src.startsWith('/*', i)) { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 2; continue; }
    return i;
  }
  return i;
};

// Lit un littéral chaîne Rust ("..." ou r#"..."#) et renvoie son contenu brut, non interprété.
const readStringLiteral = (src, start) => {
  const raw = /^r(#*)"/.exec(src.slice(start, start + 260));
  if (raw) {
    const closing = `"${raw[1]}`;
    const bodyStart = start + raw[0].length;
    const end = src.indexOf(closing, bodyStart);
    if (end === -1) throw new Error(`littéral brut non fermé (position ${start})`);
    return { value: src.slice(bodyStart, end), next: end + closing.length };
  }
  if (src[start] !== '"') throw new Error(`littéral chaîne attendu (position ${start})`);
  let i = start + 1;
  while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
  if (i >= src.length) throw new Error(`littéral chaîne non fermé (position ${start})`);
  return { value: src.slice(start + 1, i), next: i + 1 };
};

const readBareValue = (src, start) => {
  const match = /^[^,}]+/.exec(src.slice(start));
  if (!match) throw new Error(`valeur attendue (position ${start})`);
  return { value: match[0].trim(), next: start + match[0].length };
};

const readValue = (src, start) =>
  (src[start] === '"' || /^r#*"/.test(src.slice(start, start + 260)))
    ? { ...readStringLiteral(src, start), isString: true }
    : { ...readBareValue(src, start), isString: false };

const parseBlock = (src, start) => {
  const fields = {};
  let i = skipTrivia(src, start);
  while (src[i] !== '}') {
    const key = /^([a-z_]+)\s*:\s*/.exec(src.slice(i));
    if (!key) throw new Error(`champ attendu dans un bloc Migration (position ${i})`);
    const value = readValue(src, i + key[0].length);
    fields[key[1]] = value;
    i = skipTrivia(src, value.next);
    if (i >= src.length) throw new Error('bloc Migration non fermé');
  }
  return { fields, next: i + 1 };
};

const CONST_START = /\bpub\s+const\s+([A-Z0-9_]+)\s*:\s*&(?:'static\s+)?str\s*=\s*/g;

// Lit les constantes `pub const NOM: &str = "...";` (ex. src-tauri/src/schema.rs) pour résoudre
// `sql: schema::NOM`. Le texte est gardé brut, comme pour un littéral écrit dans le bloc Migration.
export const parseStringConsts = (source) => {
  const consts = {};
  for (const match of source.matchAll(CONST_START)) {
    const start = match.index + match[0].length;
    consts[match[1]] = readStringLiteral(source, start).value;
  }
  return Object.freeze(consts);
};

const resolveSql = (sql, version, constants) => {
  if (!sql) throw new Error(`migration ${version} : champ sql absent`);
  if (sql.isString) return sql.value;
  const name = sql.value.replace(/^(?:crate::)?schema::/, '');
  if (Object.hasOwn(constants, name)) return constants[name];
  throw new Error(`migration ${version} : sql « ${sql.value} » n'est ni un littéral ni une constante &str connue (include_str! non supporté)`);
};

const toMigration = (fields, constants) => {
  const { version, description, sql, kind } = fields;
  if (!version || !/^\d+$/.test(version.value)) throw new Error('champ version absent ou non entier');
  return Object.freeze({
    version: Number(version.value),
    description: description?.isString ? description.value : '',
    sql: resolveSql(sql, version.value, constants),
    kind: kind ? kind.value.replace(/^MigrationKind::/, '') : 'Up',
  });
};

export const parseMigrations = (source, constants = {}) => {
  const found = [];
  for (const match of source.matchAll(MIGRATION_START)) {
    const { fields } = parseBlock(source, match.index + match[0].length);
    found.push(toMigration(fields, constants));
  }
  return Object.freeze(found);
};

export const normalizeSpaces = (sql) => sql.replace(/\s+/g, ' ').trim();

const duplicates = (versions) => versions.filter((v, i) => versions.indexOf(v) !== i);

// Renvoie { errors, warnings } ; errors non vide = la release casserait des bases installées.
export const compareMigrations = (published, current) => {
  const errors = [];
  const warnings = [];
  if (published.length === 0) errors.push('aucune migration trouvée dans la version publiée (format de lib.rs changé ?)');
  if (current.length === 0) errors.push('aucune migration trouvée dans la version courante (format de lib.rs changé ?)');

  for (const dup of new Set(duplicates(current.map((m) => m.version)))) errors.push(`version ${dup} déclarée plusieurs fois`);

  const byVersion = new Map(current.map((m) => [m.version, m]));
  for (const old of published) {
    const now = byVersion.get(old.version);
    if (!now) { errors.push(`migration publiée ${old.version} (${old.description}) absente : sqlx refusera les bases existantes (VersionMissing)`); continue; }
    if (now.kind !== old.kind) errors.push(`migration ${old.version} : kind ${old.kind} devenu ${now.kind}`);
    if (now.sql !== old.sql) {
      const hint = normalizeSpaces(now.sql) === normalizeSpaces(old.sql) ? ' (espaces seulement, mais le checksum sqlx change quand même)' : '';
      errors.push(`migration ${old.version} : SQL modifié${hint} : sqlx refusera les bases existantes (VersionMismatch)`);
    }
    if (now.description !== old.description) warnings.push(`migration ${old.version} : description modifiée (sans effet sur sqlx)`);
  }

  const maxPublished = Math.max(0, ...published.map((m) => m.version));
  const publishedSet = new Set(published.map((m) => m.version));
  for (const m of current) {
    if (!publishedSet.has(m.version) && m.version <= maxPublished) {
      errors.push(`nouvelle migration ${m.version} inférieure à la dernière publiée (${maxPublished}) : ordre d'application divergent`);
    }
  }
  return Object.freeze({ errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
};
