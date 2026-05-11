/**
 * Configuration du Module de Réinitialisation PrestaShop
 * Fichier de référence pour la mise en place du système
 */

export const RESET_MODULE_CONFIG = {
  // Configuration API
  api: {
    baseUrl: 'http://localhost/eval/api',
    contentType: 'text/xml',
    authMethod: 'Basic Auth',
    apiKeyEnvVar: 'VITE_PS_API_KEY'
  },

  // Ressources disponibles
  resources: {
    stockAvailables: 'stock_availables',
    products: 'products',
    customers: 'customers',
    orders: 'orders'
  },

  // Configuration des resets
  resets: {
    stock: {
      resource: 'stock_availables',
      action: 'PUT',
      description: 'Réinitialise tous les stocks à 0',
      warningMessage: '⚠️ Cela va réinitialiser tous les stocks à 0. Continuer ?'
    },
    catalogue: {
      resource: 'products',
      action: 'DELETE',
      description: 'Supprime tous les produits du catalogue',
      warningMessage: '⚠️ Cela va SUPPRIMER tous les produits du catalogue. Continuer ?'
    },
    clients: {
      resource: 'customers',
      action: 'DELETE',
      description: 'Supprime tous les clients',
      warningMessage: '⚠️ Cela va SUPPRIMER tous les clients. Continuer ?'
    },
    commandes: {
      resource: 'orders',
      action: 'PUT',
      description: 'Marque toutes les commandes comme Annulées (statut 6)',
      warningMessage: '⚠️ Cela va marquer toutes les commandes comme Annulées. Continuer ?',
      apiLimitation: 'Les commandes ne peuvent pas être supprimées via l\'API PrestaShop'
    }
  },

  // Statuts PrestaShop
  orderStatuses: {
    cancelled: 6  // Utilisé pour resetCommandes
  },

  // Fichiers structure
  files: {
    service: 'src/services/prestashop.service.js',
    composable: 'src/composables/useReset.js',
    component: 'src/components/ResetModule.vue',
    styles: 'src/styles/styles.css',
    env: '.env'
  }
};

export default RESET_MODULE_CONFIG;
