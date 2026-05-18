import { ref, Ref } from 'vue';
import { resetAll } from '../services/reset.service';

interface ResetDetails {
  deletedCount: number;
  updatedCount: number;
  deleted: string[];
  updated: string[];
  failed: string[];
  skipped: string[];
}

interface UseResetReturn {
  isRunning: Ref<boolean>;
  message: Ref<string>;
  isSuccess: Ref<boolean>;
  details: Ref<ResetDetails | null>;
  confirmReset: () => void;
  performReset: () => Promise<void>;
}

export function useReset(): UseResetReturn {
  const isRunning = ref<boolean>(false);
  const message = ref<string>('');
  const isSuccess = ref<boolean>(false);
  const details = ref<ResetDetails | null>(null);

  /**
   * Effectue la réinitialisation complète
   */
  async function performReset(): Promise<void> {
    isRunning.value = true;
    message.value = '';
    isSuccess.value = false;

    try {
      const result = await resetAll();
      message.value = result.message || 'Réinitialisation terminée avec succès';
      details.value = {
        deletedCount: result.deletedCount,
        updatedCount: result.updatedCount,
        deleted: result.details?.deleted || [],
        updated: result.details?.updated || [],
        failed: result.details?.failed || [],
        skipped: result.details?.skipped || [],
      };
      isSuccess.value = result.failedCount === 0;
    } catch (error) {
      message.value = `Une erreur est survenue: ${error instanceof Error ? error.message : String(error)}`;
      isSuccess.value = false;
      console.error('Erreur réinitialisation:', error);
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * Lance la réinitialisation (appelé après confirmation)
   */
  function confirmReset(): void {
    performReset();
  }

  return {
    isRunning,
    message,
    isSuccess,
    details,
    confirmReset,
    performReset,
  };
}
