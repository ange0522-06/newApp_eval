/**
 * Utilitaires pour parser les fichiers CSV
 */

/**
 * Parse un contenu CSV en tableau de tableaux
 * Supporte séparateurs : virgule, point-virgule, tab
 * Gère les valeurs entre guillemets
 */
export function parseCSV(content: string): string[][] {
  // Auto-détection du séparateur
  const firstLine = content.split('\n')[0] || '';
  let delimiter = ',';

  if (firstLine.includes(';')) {
    delimiter = ';';
  } else if (firstLine.includes('\t')) {
    delimiter = '\t';
  }

  // Parser le CSV avec gestion des guillemets
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
          // Guillemets échappés
          currentValue += '"';
          i++; // Sauter le prochain guillemet
        } else {
          // Toggle guillemets
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        // Fin de valeur
        row.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Ajouter la dernière valeur
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
 * Normalise les accents pour comparison
 */
function normalizeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Détecte le type de fichier basé sur les en-têtes
 * Insensible à la casse ET aux accents
 */
export function detectFileType(
  headers: string[]
): 'produits' | 'declinaisons' | 'commandes' | 'inconnu' {
  const headerNormalized = headers.map((h) => normalizeAccents(h));

  // Fichier 1 : Produits
  if (
    headerNormalized.includes('nom') &&
    headerNormalized.includes('reference') &&
    headerNormalized.includes('prix_ttc') &&
    headerNormalized.includes('taxe') &&
    headerNormalized.includes('categorie')
  ) {
    return 'produits';
  }

  // Fichier 2 : Déclinaisons
  if (
    headerNormalized.includes('reference') &&
    headerNormalized.includes('specificite') &&
    headerNormalized.includes('karazany') &&
    headerNormalized.includes('stock_initial')
  ) {
    return 'declinaisons';
  }

  // Fichier 3 : Commandes
  if (
    headerNormalized.includes('nom') &&
    headerNormalized.includes('email') &&
    headerNormalized.includes('pwd') &&
    headerNormalized.includes('achat') &&
    headerNormalized.includes('etat')
  ) {
    return 'commandes';
  }

  return 'inconnu';
}

/**
 * Convertit une chaîne en nombre
 * Supporte format français : "12,5" → 12.5
 * Supporte pourcentages : "11,65%" → 0.1165
 */
export function parseNumber(value: string): number {
  if (!value) return 0;

  // Enlever les espaces
  let normalized = value.trim();

  // Gérer les pourcentages
  if (normalized.endsWith('%')) {
    normalized = normalized.slice(0, -1).trim();
    // Convertir "11,65" → 11.65 puis 11.65 / 100 = 0.1165
    const numValue = parseFloat(normalized.replace(',', '.'));
    return numValue / 100;
  }

  // Convertir virgule française en point
  normalized = normalized.replace(',', '.');

  return parseFloat(normalized) || 0;
}

/**
 * Convertit une date dd/mm/yyyy en format ISO yyyy-mm-dd HH:mm:ss
 */
export function parseDate(value: string): string {
  if (!value) {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  try {
    const parts = value.trim().split('/');
    if (parts.length !== 3) {
      return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    const [day, month, year] = parts;
    const date = new Date(`${year}-${month}-${day}`);

    if (isNaN(date.getTime())) {
      return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    return date.toISOString().replace('T', ' ').slice(0, 19);
  } catch (error) {
    console.warn(`Erreur parsing date "${value}":`, error);
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
}

/**
 * Parse la colonne "achat" : [("REFERENCE";QUANTITE;"KARAZANY")]
 * Retourne tableau d'objets {reference, quantite, karazany}
 */
export function parseAchat(
  value: string
): Array<{ reference: string; quantite: number; karazany: string }> {
  if (!value || !value.includes('(')) {
    return [];
  }

  const result: Array<{ reference: string; quantite: number; karazany: string }> =
    [];

  // Regex pour capturer : ("REFERENCE";QUANTITE;"KARAZANY")
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
 * Récupère l'index d'une colonne par son nom
 * Insensible à la casse ET aux accents
 */
export function getColumnIndex(headers: string[], columnName: string): number {
  const normalizedName = normalizeAccents(columnName);
  const index = headers.findIndex(
    (h) => normalizeAccents(h) === normalizedName
  );
  return index >= 0 ? index : -1;
}

/**
 * Récupère la valeur d'une colonne dans une ligne
 */
export function getColumnValue(headers: string[], row: string[], columnName: string): string {
  const index = getColumnIndex(headers, columnName);
  return index >= 0 ? (row[index] || '') : '';
}
