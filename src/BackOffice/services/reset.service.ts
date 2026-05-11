import { API_CONFIG } from '../config/config';

interface ResetResult {
  success: number;
  failed: number;
  errors: string[];
}

/**
 * Service de réinitialisation des données PrestaShop
 * Utilise l'API WebService pour supprimer les ressources
 */
export class ResetService {
  /**
   * Récupère tous les IDs d'une ressource et les supprime
   */
  async resetResource(resource: string, onProgress?: (current: number, total: number) => void): Promise<ResetResult> {
    const result: ResetResult = { success: 0, failed: 0, errors: [] };

    try {
      // Récupérer tous les IDs via GET
      const idsResponse = await fetch(`${API_CONFIG.BASE_URL}/${resource}?output=JSON`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!idsResponse.ok) {
        throw new Error(`Impossible de récupérer les IDs: ${idsResponse.status}`);
      }

      const data = await idsResponse.json();
      const ids = data[resource]?.map((item: any) => item.id) || [];

      console.log(`Réinitialisation de ${resource}: ${ids.length} éléments à supprimer`);

      // Supprimer chaque ressource
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          const deleteResponse = await fetch(`${API_CONFIG.BASE_URL}/${resource}/${id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (deleteResponse.ok) {
            result.success++;
          } else {
            result.failed++;
            result.errors.push(`ID ${id}: ${deleteResponse.status} ${deleteResponse.statusText}`);
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`ID ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Callback de progression
        if (onProgress) {
          onProgress(i + 1, ids.length);
        }
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Réinitialise le stock de tous les produits à 0
   */
  async resetStock(onProgress?: (current: number, total: number) => void): Promise<ResetResult> {
    const result: ResetResult = { success: 0, failed: 0, errors: [] };

    try {
      // Récupérer tous les stock_availables
      const response = await fetch(`${API_CONFIG.BASE_URL}/stock_availables?output=JSON`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Impossible de récupérer les stocks: ${response.status}`);
      }

      const data = await response.json();
      const stocks = data.stock_availables || [];

      console.log(`Réinitialisation des stocks: ${stocks.length} éléments`);

      // Mettre à jour chaque stock à 0
      for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        try {
          const updateResponse = await fetch(`${API_CONFIG.BASE_URL}/stock_availables/${stock.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stock_available: {
                id: stock.id,
                quantity: 0,
              },
            }),
          });

          if (updateResponse.ok) {
            result.success++;
          } else {
            result.failed++;
            result.errors.push(`Stock ${stock.id}: ${updateResponse.status}`);
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`Stock ${stock.id}: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (onProgress) {
          onProgress(i + 1, stocks.length);
        }
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Réinitialise le catalogue (supprime tous les produits)
   */
  async resetCatalogue(onProgress?: (current: number, total: number) => void): Promise<ResetResult> {
    return this.resetResource('products', onProgress);
  }

  /**
   * Réinitialise les clients (supprime tous les clients)
   */
  async resetClients(onProgress?: (current: number, total: number) => void): Promise<ResetResult> {
    return this.resetResource('customers', onProgress);
  }

  /**
   * Supprime toutes les commandes
   */
  async resetCommandes(onProgress?: (current: number, total: number) => void): Promise<ResetResult> {
    return this.resetResource('orders', onProgress);
  }
}

export const resetService = new ResetService();
