import { ref, reactive, Ref } from 'vue';
import { resetService } from '../services/reset.service';

interface UseResetReturn {
  progress: Ref<number>;
  total: Ref<number>;
  errors: Ref<string[]>;
  isRunning: Ref<boolean>;
  currentOperation: Ref<string>;
  rapport: { success: number; failed: number };
  resetAll: () => Promise<void>;
  resetStock: () => Promise<void>;
  resetCatalogue: () => Promise<void>;
  resetClients: () => Promise<void>;
  resetCommandes: () => Promise<void>;
}

export function useReset(): UseResetReturn {
  // État réactif
  const progress = ref<number>(0);
  const total = ref<number>(0);
  const isRunning = ref<boolean>(false);
  const errors = ref<string[]>([]);
  const currentOperation = ref<string>('');
  const rapport = reactive<{ success: number; failed: number }>({
    success: 0,
    failed: 0,
  });

  /**
   * Réinitialise le stock
   */
  async function resetStock() {
    isRunning.value = true;
    errors.value = [];
    progress.value = 0;
    total.value = 0;

    try {
      const result = await resetService.resetStock((current, max) => {
        progress.value = current;
        total.value = max;
      });

      rapport.success = result.success;
      rapport.failed = result.failed;
      errors.value = result.errors;
    } catch (error) {
      errors.value = [error instanceof Error ? error.message : String(error)];
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * Réinitialise le catalogue (supprime tous les produits)
   */
  async function resetCatalogue() {
    isRunning.value = true;
    errors.value = [];
    progress.value = 0;
    total.value = 0;

    try {
      const result = await resetService.resetCatalogue((current, max) => {
        progress.value = current;
        total.value = max;
      });

      rapport.success = result.success;
      rapport.failed = result.failed;
      errors.value = result.errors;
    } catch (error) {
      errors.value = [error instanceof Error ? error.message : String(error)];
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * Réinitialise les clients (supprime tous les clients)
   */
  async function resetClients() {
    isRunning.value = true;
    errors.value = [];
    progress.value = 0;
    total.value = 0;

    try {
      const result = await resetService.resetClients((current, max) => {
        progress.value = current;
        total.value = max;
      });

      rapport.success = result.success;
      rapport.failed = result.failed;
      errors.value = result.errors;
    } catch (error) {
      errors.value = [error instanceof Error ? error.message : String(error)];
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * Marque toutes les commandes comme Annulées
   */
  async function resetCommandes() {
    isRunning.value = true;
    errors.value = [];
    progress.value = 0;
    total.value = 0;

    try {
      const result = await resetService.resetCommandes((current, max) => {
        progress.value = current;
        total.value = max;
      });

      rapport.success = result.success;
      rapport.failed = result.failed;
      errors.value = result.errors;
    } catch (error) {
      errors.value = [error instanceof Error ? error.message : String(error)];
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * Réinitialise TOUT (stock, catalogue, clients, commandes) séquentiellement
   */
  async function resetAll() {
    isRunning.value = true;
    errors.value = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    const operations = [
      { name: 'Catalogue (Produits)', func: resetCatalogue },
      { name: 'Stocks', func: resetStock },
      { name: 'Clients', func: resetClients },
      { name: 'Commandes', func: resetCommandes },
    ];

    for (const operation of operations) {
      currentOperation.value = `Réinitialisation: ${operation.name}...`;
      await operation.func();
      totalSuccess += rapport.success;
      totalFailed += rapport.failed;
    }

    rapport.success = totalSuccess;
    rapport.failed = totalFailed;
    currentOperation.value = '';
    isRunning.value = false;
  }

  return {
    progress,
    total,
    errors,
    isRunning,
    currentOperation,
    rapport,
    resetAll,
    resetStock,
    resetCatalogue,
    resetClients,
    resetCommandes,
  };
}
