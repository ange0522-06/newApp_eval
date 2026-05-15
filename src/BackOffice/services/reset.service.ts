type ResetDetails = {
  deleted?: Record<string, number> | string[];
  skipped?: string[];
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
      'Content-Type': 'application/json',
    },
  });

  const data = (await response.json().catch(() => null)) as ResetApiResponse | null;
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || `Reset impossible: HTTP ${response.status}`);
  }

  return {
    deletedCount: data.deletedCount || 0,
    skippedCount: data.skippedCount || 0,
    failedCount: data.failedCount || 0,
    message: data.message || 'Reset termine avec succes',
    details: {
      deleted: normalizeDeleted(data.details),
      skipped: data.details?.skipped || [],
      failed: [],
    },
  };
}
