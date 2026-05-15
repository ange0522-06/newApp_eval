import { ref, Ref } from 'vue';
import { resetAll } from '../services/reset.service';

interface UseResetReturn {
  isRunning: Ref<boolean>;
  message: Ref<string>;
  isSuccess: Ref<boolean>;
  confirmReset: () => void;
  performReset: () => Promise<void>;
}

export function useReset(): UseResetReturn {
  const isRunning = ref<boolean>(false);
  const message = ref<string>('');
  const isSuccess = ref<boolean>(false);

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
      isSuccess.value = true;
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
    confirmReset,
    performReset,
  };
}
