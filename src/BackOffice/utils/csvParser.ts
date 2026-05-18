/**
 * Utilitaires pour parser les fichiers CSV.
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
    'specificité',
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

function cleanHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim();
}

function hasExactHeaders(headers: string[], expected: string[]): boolean {
  const cleaned = headers.map(cleanHeader);
  // ✅ Case-insensitive mais RESPECTE les accents
  // "Specificité" === "specificité" OK (juste casse différente)
  // "specificite" !== "specificité" NOT OK (accent manquant = caractère différent)
  return expected.every((header) => 
    cleaned.some(h => h.toLowerCase() === header.toLowerCase())
  );
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

/**
 * Detecte le type de fichier avec des noms de colonnes stricts.
 * La casse, les accents et les caracteres doivent correspondre exactement.
 */
export function detectFileType(
  headers: string[]
): ImportFileType | 'inconnu' {
  if (hasExactHeaders(headers, EXPECTED_HEADERS.produits)) return 'produits';
  if (hasExactHeaders(headers, EXPECTED_HEADERS.declinaisons)) return 'declinaisons';
  if (hasExactHeaders(headers, EXPECTED_HEADERS.commandes)) return 'commandes';

  return 'inconnu';
}

export function getExpectedHeaders(type: ImportFileType): string[] {
  return [...EXPECTED_HEADERS[type]];
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
 * Convertit une date d/m/yyyy ou dd/mm/yyyy en format ISO yyyy-mm-dd HH:mm:ss.
 * Tout autre format est refuse.
 */
export function parseDate(value: string): string {
  if (!value) {
    throw new Error('Date vide: format attendu d/m/yyyy');
  }

  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Date invalide "${value}": format attendu d/m/yyyy`);
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

  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Parse la colonne "achat" : [("REFERENCE";QUANTITE;"KARAZANY")].
 * Retourne tableau d'objets {reference, quantite, karazany}.
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

/**
 * ✅ Recupere l'index d'une colonne par son nom (case-insensitive mais respecte accents).
 */
export function getColumnIndex(headers: string[], columnName: string): number {
  const index = headers.findIndex((header) => 
    cleanHeader(header).toLowerCase() === columnName.toLowerCase()
  );
  return index >= 0 ? index : -1;
}

/**
 * Recupere la valeur d'une colonne dans une ligne.
 */
export function getColumnValue(headers: string[], row: string[], columnName: string): string {
  const index = getColumnIndex(headers, columnName);
  return index >= 0 ? (row[index] || '') : '';
}
