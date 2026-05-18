type ResetDetails = {
  deleted?: Record<string, number> | string[];
  updated?: Record<string, number> | string[];
  skipped?: string[];
  failed?: string[];
};

type ResetApiResponse = {
  success: boolean;
  message?: string;
  deletedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  details?: ResetDetails;
};

export type ResetResult = {
  deletedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  message: string;
  details: {
    deleted: string[];
    updated: string[];
    skipped: string[];
    failed: string[];
  };
};

// ✅ OPTIMISATION: Cache pour éviter les resets répétés
const resetCache = { inProgress: false, lastReset: 0, CACHE_TTL: 30 * 1000 }; // 30 secondes

function normalizeCountedItems(items?: Record<string, number> | string[]): string[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;

  return Object.entries(items)
    .filter(([, count]) => count > 0)
    .map(([resource, count]) => `${resource}: ${count}`);
}

function parseCountedItems(root: Element, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector))
    .map((el) => {
      const resource = el.getAttribute('resource');
      const count = el.textContent?.trim() || '0';
      return resource ? `${resource}: ${count}` : count;
    })
    .filter(Boolean);
}

export async function resetAll(): Promise<ResetResult> {
  // ✅ OPTIMISATION: Éviter les resets rapides répétés
  if (resetCache.inProgress) {
    throw new Error('Un reset est déjà en cours. Veuillez attendre.');
  }
  
  const timeSinceLastReset = Date.now() - resetCache.lastReset;
  if (timeSinceLastReset < resetCache.CACHE_TTL) {
    console.warn(`⚠️ Trop de resets rapides (dernier: ${timeSinceLastReset}ms). Veuillez attendre.`);
    throw new Error(`Veuillez attendre ${Math.ceil((resetCache.CACHE_TTL - timeSinceLastReset) / 1000)}s avant un nouveau reset.`);
  }

  resetCache.inProgress = true;
  const resetStartTime = performance.now();

  try {
    const response = await fetch('/newapp-api/reset-import.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: '<?xml version="1.0" encoding="UTF-8"?><prestashop></prestashop>',
    });

    let data: ResetApiResponse | null = null;
    let responseText = '';

    try {
      responseText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, 'text/xml');
      
      if (xmlDoc.documentElement.tagName === 'parsererror') {
        throw new Error('Invalid XML response');
      }

      const root = xmlDoc.documentElement;
      const success = root.getAttribute('success') === 'true' || root.getAttribute('success') === '1';
      const message = root.querySelector('message')?.textContent || '';
      const deletedCount = parseInt(root.getAttribute('deletedCount') || '0', 10);
      const updatedCount = parseInt(root.getAttribute('updatedCount') || '0', 10);
      const skippedCount = parseInt(root.getAttribute('skippedCount') || '0', 10);
      const failedCount = parseInt(root.getAttribute('failedCount') || '0', 10);

      data = {
        success,
        message,
        deletedCount,
        updatedCount,
        skippedCount,
        failedCount,
        details: {
          deleted: parseCountedItems(root, 'details > deleted > item'),
          updated: parseCountedItems(root, 'details > updated > item'),
          skipped: Array.from(root.querySelectorAll('details > skipped > item')).map(el => el.textContent || ''),
          failed: Array.from(root.querySelectorAll('details > failed > item')).map(el => el.textContent || ''),
        },
      };
    } catch (parseError) {
      console.error('XML parse error:', parseError, 'Response:', responseText);
    }

    // Check if response is ok
    if (!response.ok) {
      throw new Error(`Reset HTTP error ${response.status}: ${data?.message || responseText || 'Unknown error'}`);
    }

    // Accept reset even with some failures (orphaned products, etc.)
    if (!data) {
      throw new Error(`Reset failed: invalid response structure`);
    }

    // ✅ OPTIMISATION: Effacer les caches après un reset réussi
    // Note: Les caches du service d'import sont gérés indépendamment
    console.log('💾 Reset terminé en', Math.round(performance.now() - resetStartTime), 'ms');
    
    // Mettre à jour le cache du throttle
    resetCache.lastReset = Date.now();

    return {
      deletedCount: data.deletedCount || 0,
      updatedCount: data.updatedCount || 0,
      skippedCount: data.skippedCount || 0,
      failedCount: data.failedCount || 0,
      message: data.message || 'Reset termine avec succes',
      details: {
        deleted: normalizeCountedItems(data.details?.deleted),
        updated: normalizeCountedItems(data.details?.updated),
        skipped: data.details?.skipped || [],
        failed: data.details?.failed || [],
      },
    };
  } finally {
    resetCache.inProgress = false;
  }
}
