import * as XLSX from 'xlsx';

/** Signatures binaires : xlsx / ods (archive zip) et xls (conteneur OLE). */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];
const TEXT_EXTENSIONS = /\.(csv|txt|tsv)$/i;

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  signature.every((b, i) => bytes[i] === b);

/** Vrai pour un CSV / texte : extension texte, ou absence de signature de classeur binaire. */
export const isTextFile = (name: string, bytes: Uint8Array): boolean =>
  TEXT_EXTENSIONS.test(name) || !(startsWith(bytes, ZIP_SIGNATURE) || startsWith(bytes, OLE_SIGNATURE));

/** UTF-8 strict (BOM retiré), sinon windows-1252 (CSV enregistré par Excel FR). */
export const decodeText = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
};

/**
 * Lit un fichier d'import. Les CSV sont décodés par nous puis lus avec `raw: true` : leurs cellules
 * restent du texte (SheetJS ne transforme pas « 03/04/2026 » en date américaine), et c'est notre
 * parseur qui lit jj/mm/aaaa. Les xlsx / xls sont lus normalement (types de cellule du classeur).
 */
export const readWorkbook = async (file: File): Promise<XLSX.WorkBook> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return isTextFile(file.name, bytes)
    ? XLSX.read(decodeText(bytes), { type: 'string', raw: true })
    : XLSX.read(bytes, { type: 'array' });
};
