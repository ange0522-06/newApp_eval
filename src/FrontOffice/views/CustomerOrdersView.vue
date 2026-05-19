<template>
  <div class="orders-page">
    <div class="orders-header">
      <h1>Mes Commandes</h1>
      <button class="btn-back" @click="$router.push('/home')">← Retour</button>
    </div>

    <div v-if="isLoading" class="loading">
      ⏳ Chargement des commandes...
    </div>

    <div v-else-if="orders.length === 0" class="empty-orders">
      <p>Vous n'avez pas encore de commandes.</p>
      <button class="btn-order" @click="$router.push('/home')">Découvrir nos produits</button>
    </div>

    <div v-else class="orders-list">
      <div v-for="order in orders" :key="order.id" class="order-card">
        <div class="order-header">
          <div class="order-info">
            <h3>Commande #{{ order.reference }}</h3>
            <p class="order-date">{{ formatDate(order.date_add) }}</p>
          </div>
          <div class="order-status" :class="order.stateName.toLowerCase()">
            {{ order.stateName }}
          </div>
        </div>

        <div class="order-details">
          <div class="detail-row">
            <span>Total:</span>
            <strong>{{ formatPrice(order.total_paid) }}</strong>
          </div>
          <div class="detail-row">
            <span>État:</span>
            <span :class="`badge badge-${getStateColor(order.current_state)}`">
              {{ getStateName(order.current_state) }}
            </span>
          </div>
        </div>

        <button 
          class="btn-view-details"
          @click="showOrderDetails(order.id)"
        >
          Voir détails →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getAllIds, getOne } from '@/shared/services/prestashop.service.js'

interface Order {
  id: string
  reference: string
  date_add: string
  current_state: string
  total_paid: string
  stateName: string
}

const router = useRouter()
const orders = ref<Order[]>([])
const isLoading = ref(true)

const isAuthenticated = computed(() =>
  localStorage.getItem('auth_authenticated') === 'true' &&
  localStorage.getItem('auth_email') !== null
)

const STATE_MAP: Record<string, string> = {
  '2': 'Paiement accepté',
  '6': 'Annulée',
  '8': 'En attente',
  '9': 'Remboursée',
}

function getStateName(stateId: string): string {
  return STATE_MAP[stateId] || 'Inconnu'
}

function getStateColor(stateId: string): string {
  switch (stateId) {
    case '2':
      return 'success'
    case '6':
      return 'danger'
    case '9':
      return 'info'
    default:
      return 'warning'
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function formatPrice(priceStr: string): string {
  try {
    const price = parseFloat(priceStr) || 0
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(price)
  } catch {
    return priceStr
  }
}

function showOrderDetails(orderId: string) {
  // À implémenter: afficher les détails de la commande
  console.log('Détails commande:', orderId)
}

async function loadOrders() {
  if (!isAuthenticated.value) {
    router.push('/login?redirect=/orders')
    return
  }

  try {
    isLoading.value = true
    const email = localStorage.getItem('auth_email')
    if (!email) return

    // Trouver l'ID client par email
    const customerIds = await getAllIds('customers')
    let customerId = ''

    for (const id of customerIds) {
      const customer: any = await getOne('customers', id)
      if (customer && customer.email === email) {
        customerId = id
        break
      }
    }

    if (!customerId) return

    // Charger les commandes du client
    const orderIds = await getAllIds('orders')
    for (const orderId of orderIds) {
      const order: any = await getOne('orders', orderId)
      if (order && order.id_customer === customerId) {
        orders.value.push({
          id: orderId,
          reference: order.reference || `CMD-${orderId}`,
          date_add: order.date_add || '',
          current_state: order.current_state || '',
          total_paid: order.total_paid || '0',
          stateName: getStateName(order.current_state || ''),
        })
      }
    }

    // Trier par date décroissante
    orders.value.sort(
      (a, b) => new Date(b.date_add).getTime() - new Date(a.date_add).getTime()
    )
  } catch (err) {
    console.error('Erreur chargement commandes:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadOrders()
})
</script>

<style scoped>
.orders-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.orders-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 2px solid #eee;
  padding-bottom: 1rem;
}

.orders-header h1 {
  margin: 0;
  color: #333;
}

.btn-back {
  padding: 0.5rem 1rem;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-back:hover {
  background: #e0e0e0;
}

.loading,
.empty-orders {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty-orders p {
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
}

.orders-list {
  display: grid;
  gap: 1.5rem;
}

.order-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  background: #fff;
  transition: all 0.3s ease;
}

.order-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #2a7ae2;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.order-info h3 {
  margin: 0;
  color: #333;
  font-size: 1.1rem;
}

.order-date {
  margin: 0.5rem 0 0 0;
  color: #999;
  font-size: 0.9rem;
}

.order-status {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  font-size: 0.9rem;
  text-transform: uppercase;
}

.order-status.paiement {
  background: #d4edda;
  color: #155724;
}

.order-status.annulée {
  background: #f8d7da;
  color: #721c24;
}

.order-status.en {
  background: #fff3cd;
  color: #856404;
}

.order-details {
  margin-bottom: 1rem;
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 4px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.detail-row span {
  color: #666;
}

.detail-row strong {
  color: #333;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: bold;
}

.badge-success {
  background: #d4edda;
  color: #155724;
}

.badge-danger {
  background: #f8d7da;
  color: #721c24;
}

.badge-warning {
  background: #fff3cd;
  color: #856404;
}

.badge-info {
  background: #d1ecf1;
  color: #0c5460;
}

.btn-view-details {
  width: 100%;
  padding: 0.75rem;
  background: #2a7ae2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.3s;
}

.btn-view-details:hover {
  background: #1e5ba8;
}

.btn-order {
  padding: 0.75rem 1.5rem;
  background: #2a7ae2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.btn-order:hover {
  background: #1e5ba8;
}
</style>
