<template>
  <div class="orders-view page-content container p-md">
    <div class="orders-header">
      <h1 class="text-primary font-bold">Gestion des commandes</h1>
      <button
        @click="loadOrders"
        :disabled="isLoading"
        class="btn btn-primary"
      >
        {{ isLoading ? '⏳ Actualisation...' : '🔄 Actualiser' }}
      </button>
    </div>

    <!-- Message de chargement -->
    <div v-if="isLoading && orders.length === 0" class="message info">
      ⏳ Chargement des commandes...
    </div>

    <!-- Message d'erreur -->
    <div v-if="errorMessage" class="message error">
      ❌ {{ errorMessage }}
    </div>

    <!-- Message de succès -->
    <div v-if="successMessage" class="message success">
      ✅ {{ successMessage }}
    </div>

    <!-- Liste vide -->
    <div v-if="!isLoading && orders.length === 0 && !errorMessage" class="message info">
      ℹ️ Aucune commande trouvée
    </div>

    <!-- Tableau des commandes -->
    <div v-if="orders.length > 0" class="orders-table-wrapper">
      <table class="orders-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Référence</th>
            <th>Date</th>
            <th>Client</th>
            <th>Total</th>
            <th>État</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id" class="order-row">
            <td class="cell-id">{{ order.id }}</td>
            <td class="cell-reference">{{ order.reference }}</td>
            <td class="cell-date">{{ formatDate(order.date_add) }}</td>
            <td class="cell-customer">{{ order.customerName }}</td>
            <td class="cell-total">{{ formatPrice(order.total_paid, order.conversion_rate) }}</td>
            <td class="cell-state">
              <span :class="['badge', `badge-${getStateBadgeClass(order.current_state)}`]">
                {{ order.stateName }}
              </span>
            </td>
            <td class="cell-actions">
              <div class="action-buttons">
                <!-- Échec supprimé — on gère seulement Payée et Annulé pour correspondre à PrestaShop simplifié -->
                <button
                  @click="changeOrderState(order, '2')"
                  :disabled="order.current_state === '2' || isUpdating[order.id]"
                  class="btn btn-primary"
                  title="Marquer comme paiement effectué"
                >
                  ✅ Payée
                </button>
                <button
                  @click="changeOrderState(order, '6')"
                  :disabled="order.current_state === '6' || isUpdating[order.id]"
                  class="btn btn-danger"
                  title="Marquer comme annulée"
                >
                  🚫 Annuler
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import '../../styles/styles.css';
import { ref, onMounted } from 'vue';
import { getAllOrders, updateOrderState, type Order } from '../services/orders.service';

// État
const orders = ref<Order[]>([]);
const isLoading = ref(false);
const isUpdating = ref<{ [key: string]: boolean }>({});
const errorMessage = ref('');
const successMessage = ref('');

/**
 * Formate une date ISO vers format lisible
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Formate un prix avec symbole devise
 */
function formatPrice(priceStr: string, conversionRateStr?: string): string {
  if (!priceStr) return '0 €';
  try {
    const price = parseFloat(priceStr) || 0;
    const conv = conversionRateStr ? parseFloat(conversionRateStr) || 1 : 1;
    // Convert to EUR using conversion rate (price in shop currency / conversion_rate)
    const euro = conv && conv !== 0 ? price / conv : price;
    return `${euro.toFixed(2)} €`;
  } catch {
    return priceStr;
  }
}

/**
 * Retourne la classe CSS pour le badge selon l'état
 */
  function getStateBadgeClass(stateId: string): string {
  switch (stateId) {
    case '13':
      return 'info'; // Paiement a la livraison
    case '2':
      return 'success'; // Paiement effectué → vert
    case '6':
      return 'cancel'; // Annulé → gris
    default:
      return 'info'; // Inconnu → bleu
  }
}

/**
 * Réinitialise les messages
 */
function clearMessages(): void {
  errorMessage.value = '';
  successMessage.value = '';
}

/**
 * Charge toutes les commandes
 */
async function loadOrders(): Promise<void> {
  isLoading.value = true;
  clearMessages();

  try {
    orders.value = await getAllOrders();
    if (orders.value.length === 0) {
      // Pas d'erreur, juste aucune commande
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Erreur lors du chargement des commandes';
    console.error('Erreur loadOrders:', error);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Change l'état d'une commande
 */
async function changeOrderState(order: Order, newStateId: string): Promise<void> {
  // Marquer comme en cours de mise à jour
  isUpdating.value[order.id] = true;
  clearMessages();

  try {
    const success = await updateOrderState(order.id, newStateId);

    if (success) {
      // Mettre à jour localement le tableau (sans recharger)
      const stateNameMap: { [key: string]: string } = {
        '13': 'Paiement a la livraison',
        '2': 'Paiement effectué',
        '6': 'Annulé',
        '8': 'Échec paiement',
      };

      const orderIndex = orders.value.findIndex((o) => o.id === order.id);
      if (orderIndex >= 0) {
        orders.value[orderIndex].current_state = newStateId;
        orders.value[orderIndex].stateName = stateNameMap[newStateId] || 'Inconnu';
      }

      successMessage.value = `✅ Commande #${order.reference} mise à jour`;

      // Masquer le message après 3 secondes
      setTimeout(() => {
        successMessage.value = '';
      }, 3000);
    } else {
      errorMessage.value = `❌ Impossible de mettre à jour la commande #${order.reference}`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : `Erreur lors de la mise à jour de la commande #${order.reference}`;
    console.error('Erreur changeOrderState:', error);
  } finally {
    isUpdating.value[order.id] = false;
  }
}

/**
 * Chargement initial
 */
onMounted(() => {
  loadOrders();
});
</script>

<style scoped>
.orders-view {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.orders-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #eee;
}

.orders-header h1 {
  margin: 0;
  font-size: 28px;
  color: #333;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-refresh {
  background: #0066cc;
  color: white;
  padding: 10px 20px;
  font-size: 14px;
}

.btn-refresh:hover:not(:disabled) {
  background: #0052a3;
}

/* Messages */
.message {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 20px;
  font-size: 14px;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.message.info {
  background: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}

/* Tableau */
.orders-table-wrapper {
  overflow-x: auto;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.orders-table thead {
  background: #f5f5f5;
  border-bottom: 2px solid #ddd;
}

.orders-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #333;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.orders-table tbody tr {
  border-bottom: 1px solid #eee;
  transition: background 0.2s;
}

.orders-table tbody tr:hover {
  background: #f9f9f9;
}

.orders-table td {
  padding: 12px 16px;
  font-size: 14px;
  color: #333;
}

.cell-id {
  font-weight: 600;
  color: #0066cc;
}

.cell-reference {
  font-family: monospace;
  font-size: 12px;
}

.cell-date {
  font-size: 12px;
  color: #666;
}

.cell-customer {
  font-weight: 500;
}

.cell-total {
  text-align: right;
  font-weight: 600;
}

.cell-state {
  text-align: center;
}

.cell-actions {
  text-align: center;
}

/* Badges */
.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-success {
  background: #d4edda;
  color: #155724;
}

.badge-error {
  background: #f8d7da;
  color: #721c24;
}

.badge-cancel {
  background: #e2e3e5;
  color: #383d41;
}

.badge-info {
  background: #d1ecf1;
  color: #0c5460;
}

/* Boutons d'action */
.action-buttons {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-state {
  padding: 6px 12px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.btn-error:hover:not(:disabled) {
  background: #f5c2c7;
  color: #641a1c;
}

.btn-success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.btn-success:hover:not(:disabled) {
  background: #c3e6cb;
  color: #0f3622;
}

.btn-cancel {
  background: #e2e3e5;
  color: #383d41;
  border: 1px solid #d3d6db;
}

.btn-cancel:hover:not(:disabled) {
  background: #d3d6db;
  color: #2c3032;
}

.btn-state:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 768px) {
  .orders-view {
    padding: 10px;
  }

  .orders-header {
    flex-direction: column;
    gap: 15px;
    align-items: flex-start;
  }

  .orders-header h1 {
    font-size: 20px;
  }

  .orders-table {
    font-size: 12px;
  }

  .orders-table th,
  .orders-table td {
    padding: 8px 10px;
  }

  .action-buttons {
    gap: 3px;
  }

  .btn-state {
    padding: 4px 8px;
    font-size: 10px;
  }
}
</style>
