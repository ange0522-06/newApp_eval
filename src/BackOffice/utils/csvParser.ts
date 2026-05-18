/**
 * Utilitaires pour parser et valider les fichiers CSV.
 */

type ImportFileType = 'produits' | 'declinaisons' | 'commandes';

const EXPECTED_HEADERS: Record<ImportFileType, string[]> = {
  produits: [
    'date_availability_produit',
    'nom',
    'reference',
    'prix_ttc',
    'Taxe',
    'categorie',
    'prix_achat',
  ],
  declinaisons: [
    'reference',
    'specificite',
    'karazany',
    'stock_initial',
    'prix_vente_ttc',
  ],
  commandes: [
    'date',
    'nom',
    'email',
    'pwd',
    'adresse',
    'achat',
    'etat',
  ],
};

const DISPLAY_HEADERS: Record<ImportFileType, string[]> = {
  produits: EXPECTED_HEADERS.produits,
  declinaisons: ['reference', 'specificite', 'karazany', 'stock_initial', 'prix_vente_ttc'],
  commandes: EXPECTED_HEADERS.commandes,
};

export function cleanHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim();
}

function repairCommonMojibake(value: string): string {
  return value
    .replace(/Ã©/g, 'e')
    .replace(/Ã¨/g, 'e')
    .replace(/Ãª/g, 'e')
    .replace(/Ã«/g, 'e')
    .replace(/Ã /g, 'a')
    .replace(/Ã¢/g, 'a')
    .replace(/Ã®/g, 'i')
    .replace(/Ã´/g, 'o')
    .replace(/Ã¹/g, 'u')
    .replace(/Ã»/g, 'u')
    .replace(/Ã§/g, 'c');
}

function normalizeForMatch(value: string): string {
  return repairCommonMojibake(cleanHeader(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

function hasExactHeaders(headers: string[], expected: string[]): boolean {
  const cleaned = headers.map(normalizeForMatch);
  if (cleaned.length !== expected.length) return false;

  return expected.every((header, index) => cleaned[index] === normalizeForMatch(header));
}

/**
 * Parse un contenu CSV en tableau de tableaux.
 * Supporte separateurs : virgule, point-virgule, tab.
 * Gere les valeurs entre guillemets.
 */
export function parseCSV(content: string): string[][] {
  const firstLine = content.split('\n')[0] || '';
  let delimiter = ',';

  if (firstLine.includes(';')) {
    delimiter = ';';
  } else if (firstLine.includes('\t')) {
    delimiter = '\t';
  }

  const lines = content.split('\n').filter((line) => line.trim());
  const result: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        row.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    if (currentValue || row.length > 0) {
      row.push(currentValue.trim());
    }

    if (row.length > 0) {
      result.push(row);
    }
  }

  return result;
}

export function detectFileType(headers: string[]): ImportFileType | 'inconnu' {
  if (hasExactHeaders(headers, EXPECTED_HEADERS.produits)) return 'produits';
  if (hasExactHeaders(headers, EXPECTED_HEADERS.declinaisons)) return 'declinaisons';
  if (hasExactHeaders(headers, EXPECTED_HEADERS.commandes)) return 'commandes';

  return 'inconnu';
}

export function getExpectedHeaders(type: ImportFileType): string[] {
  return [...DISPLAY_HEADERS[type]];
}

/**
 * Convertit une chaine en nombre.
 * Supporte format francais : "12,5" -> 12.5.
 * Supporte pourcentages : "11,65%" -> 0.1165.
 */
export function parseNumber(value: string): number {
  if (!value) return 0;

  let normalized = value.trim();

  if (normalized.endsWith('%')) {
    normalized = normalized.slice(0, -1).trim();
    const numValue = parseFloat(normalized.replace(',', '.'));
    return numValue / 100;
  }

  normalized = normalized.replace(',', '.');

  return parseFloat(normalized) || 0;
}

/**
 * Convertit une date d/m/yyyy ou dd/mm/yyyy en yyyy-mm-dd HH:mm:ss.
 */
export function parseDate(value: string): string {
  if (!value) {
    throw new Error('Date vide: format attendu dd/mm/yyyy');
  }

  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Date invalide "${value}": format attendu dd/mm/yyyy`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Date invalide "${value}": date inexistante`);
  }

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} 00:00:00`;
}

/**
 * Parse la colonne "achat" : [("REFERENCE";QUANTITE;"KARAZANY")].
 */
export function parseAchat(
  value: string
): Array<{ reference: string; quantite: number; karazany: string }> {
  if (!value || !value.includes('(')) {
    return [];
  }

  const result: Array<{ reference: string; quantite: number; karazany: string }> = [];
  const regex = /\(\s*"([^"]+)"\s*;\s*(\d+)\s*;\s*"([^"]*)"\s*\)/g;

  let match;
  while ((match = regex.exec(value)) !== null) {
    result.push({
      reference: match[1],
      quantite: parseInt(match[2], 10) || 1,
      karazany: match[3],
    });
  }

  return result;
}

export function getColumnIndex(headers: string[], columnName: string): number {
  const wanted = normalizeForMatch(columnName);
  const index = headers.findIndex((header) => normalizeForMatch(header) === wanted);
  return index >= 0 ? index : -1;
}

export function getColumnValue(headers: string[], row: string[], columnName: string): string {
  const index = getColumnIndex(headers, columnName);
  return index >= 0 ? (row[index] || '') : '';
}

function normalizeStatus(value: string): string {
  return repairCommonMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}

function assertPositive(value: string, label: string, rowNumber: number, allowEmpty = false): void {
  if (!value && allowEmpty) return;
  const parsed = parseNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} ligne ${rowNumber}: montant positif attendu`);
  }
}

function assertNonNegativeInteger(value: string, label: string, rowNumber: number): void {
  if (!value.trim()) {
    throw new Error(`${label} ligne ${rowNumber}: entier positif ou zero attendu`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} ligne ${rowNumber}: entier positif ou zero attendu`);
  }
}

export function validateImportRows(
  type: ImportFileType,
  headers: string[],
  rows: string[][]
): void {
  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (type === 'produits') {
      parseDate(getColumnValue(headers, row, 'date_availability_produit'));
      ['nom', 'reference', 'categorie'].forEach((column) => {
        if (!getColumnValue(headers, row, column)) {
          throw new Error(`Fichier 1 ligne ${rowNumber}: colonne ${column} requise`);
        }
      });
      assertPositive(getColumnValue(headers, row, 'prix_ttc'), 'Fichier 1 prix_ttc', rowNumber);
      assertPositive(getColumnValue(headers, row, 'Taxe'), 'Fichier 1 Taxe', rowNumber);
      assertPositive(getColumnValue(headers, row, 'prix_achat'), 'Fichier 1 prix_achat', rowNumber);
    }

    if (type === 'declinaisons') {
      if (!getColumnValue(headers, row, 'reference')) {
        throw new Error(`Fichier 2 ligne ${rowNumber}: reference requise`);
      }
      assertNonNegativeInteger(getColumnValue(headers, row, 'stock_initial'), 'Fichier 2 stock_initial', rowNumber);
      assertPositive(getColumnValue(headers, row, 'prix_vente_ttc'), 'Fichier 2 prix_vente_ttc', rowNumber, true);
      const specificite = getColumnValue(headers, row, 'specificite');
      const karazany = getColumnValue(headers, row, 'karazany');
      if ((specificite && !karazany) || (!specificite && karazany)) {
        throw new Error(`Fichier 2 ligne ${rowNumber}: specificite et karazany doivent etre remplis ensemble`);
      }
    }

    if (type === 'commandes') {
      parseDate(getColumnValue(headers, row, 'date'));
      ['nom', 'email', 'pwd', 'adresse', 'achat'].forEach((column) => {
        if (!getColumnValue(headers, row, column)) {
          throw new Error(`Fichier 3 ligne ${rowNumber}: colonne ${column} requise`);
        }
      });
      if (parseAchat(getColumnValue(headers, row, 'achat')).length === 0) {
        throw new Error(`Fichier 3 ligne ${rowNumber}: achat invalide`);
      }
      const state = normalizeStatus(getColumnValue(headers, row, 'etat'));
      const allowedStates = ['', 'paiement accepte', 'paiement effectue', 'livre', 'annule'];
      if (!allowedStates.includes(state)) {
        throw new Error(`Fichier 3 ligne ${rowNumber}: etat invalide. Valeurs: vide, paiement accepte, paiement effectue, livre, annule`);
      }
    }
  });
}
