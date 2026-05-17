type ResetDetails = {
  deleted?: Record<string, number> | string[];
  skipped?: string[];
  failed?: string[];
};

type ResetApiResponse = {
  success: boolean;
  message?: string;
  deletedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  details?: ResetDetails;
};

export type ResetResult = {
  deletedCount: number;
  skippedCount: number;
  failedCount: number;
  message: string;
  details: {
    deleted: string[];
    skipped: string[];
    failed: string[];
  };
};

function normalizeDeleted(details?: ResetDetails): string[] {
  if (!details?.deleted) return [];
  if (Array.isArray(details.deleted)) return details.deleted;

  return Object.entries(details.deleted)
    .filter(([, count]) => count > 0)
    .map(([resource, count]) => `${resource}: ${count}`);
}

export async function resetAll(): Promise<ResetResult> {
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
    const skippedCount = parseInt(root.getAttribute('skippedCount') || '0', 10);
    const failedCount = parseInt(root.getAttribute('failedCount') || '0', 10);

    data = {
      success,
      message,
      deletedCount,
      skippedCount,
      failedCount,
      details: {
        deleted: Array.from(root.querySelectorAll('details > deleted > item')).map(el => el.textContent || ''),
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

  return {
    deletedCount: data.deletedCount || 0,
    skippedCount: data.skippedCount || 0,
    failedCount: data.failedCount || 0,
    message: data.message || 'Reset termine avec succes',
    details: {
      deleted: data.details?.deleted || [],
      skipped: data.details?.skipped || [],
      failed: data.details?.failed || [],
    },
  };
}
