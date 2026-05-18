<template>
  <section class="my-orders">
    <header class="my-orders__header">
      <h1>Mes commandes</h1>
      <button class="secondary-button" type="button" :disabled="isLoading" @click="loadOrders">
        {{ isLoading ? 'Actualisation...' : 'Actualiser' }}
      </button>
    </header>

    <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
    <p v-if="isLoading && orders.length === 0" class="message">Chargement des commandes...</p>

    <div v-if="orders.length > 0" class="orders-table">
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Date</th>
            <th>Total</th>
            <th>Etat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td>{{ order.reference || `#${order.id}` }}</td>
            <td>{{ formatDate(order.date_add) }}</td>
            <td>{{ formatPrice(order.total_paid) }}</td>
            <td>
              <span :class="['state-badge', `state-badge--${badgeClass(order.current_state)}`]">
                {{ order.stateName }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!isLoading && !errorMessage" class="empty-state">
      <p>Aucune commande pour ce compte.</p>
      <button class="primary-button" type="button" @click="router.push('/home')">
        Voir les produits
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getMyOrders, type CustomerOrder } from '../services/orders.service'

const router = useRouter()
const orders = ref<CustomerOrder[]>([])
const isLoading = ref(false)
const errorMessage = ref('')

function formatPrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(value: string): string {
  if (!value) return '-'
  return new Date(value.replace(' ', 'T')).toLocaleString('fr-FR')
}

function badgeClass(stateId: string): string {
  if (stateId === '5') return 'delivered'
  if (stateId === '6') return 'cancelled'
  if (stateId === '2' || stateId === '13') return 'paid'
  return 'pending'
}

async function loadOrders() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    orders.value = await getMyOrders()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossible de charger vos commandes.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadOrders)
</script>

<style scoped>
.my-orders {
  margin: 0 auto;
  max-width: 960px;
  padding: 1rem;
}

.my-orders__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.my-orders__header h1 {
  font-size: 1.7rem;
  margin: 0;
}

.orders-table {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow-x: auto;
}

table {
  background: #fff;
  border-collapse: collapse;
  width: 100%;
}

th,
td {
  border-bottom: 1px solid #eef2f7;
  padding: 0.8rem 1rem;
  text-align: left;
}

th {
  background: #f8fafc;
  color: #374151;
  font-size: 0.82rem;
  text-transform: uppercase;
}

.state-badge {
  border-radius: 999px;
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.6rem;
}

.state-badge--paid {
  background: #dbeafe;
  color: #1d4ed8;
}

.state-badge--delivered {
  background: #dcfce7;
  color: #15803d;
}

.state-badge--cancelled {
  background: #fee2e2;
  color: #b91c1c;
}

.state-badge--pending {
  background: #f3f4f6;
  color: #374151;
}

.primary-button,
.secondary-button {
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  padding: 0.65rem 0.95rem;
}

.primary-button {
  background: #2a7ae2;
  color: #fff;
}

.secondary-button {
  background: #eef2ff;
  color: #1f2937;
}

.message,
.empty-state {
  background: #f8fafc;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  padding: 1rem;
}

.message--error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}
</style>
