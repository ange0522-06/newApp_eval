<template>
  <div class="dashboard-view">
    <div class="dashboard-header">
      <div>
        <h1>Tableau de bord</h1>
        <p>Commandes payees ou livrees par jour, montants et etats utilises.</p>
      </div>
      <button class="btn-refresh" type="button" :disabled="isLoading" @click="loadStats">
        {{ isLoading ? 'Actualisation...' : 'Actualiser' }}
      </button>
    </div>

    <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
    <div v-if="isLoading && !stats" class="message info">Chargement du tableau de bord...</div>

    <template v-if="stats">
      <section class="summary-grid">
        <article class="summary-card">
          <span>Payees / livrees</span>
          <strong>{{ stats.totalOrders }}</strong>
        </article>
        <article class="summary-card">
          <span>Montant total</span>
          <strong>{{ formatPrice(stats.totalAmount) }}</strong>
        </article>
        <article class="summary-card">
          <span>Dans le panier</span>
          <strong>{{ stats.pendingCarts }}</strong>
        </article>
      </section>

      <section class="dashboard-section">
        <h2>Par jour</h2>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Nb commande</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.days" :key="row.date">
                <td>{{ formatDay(row.date) }}</td>
                <td>{{ row.count }}</td>
                <td>{{ formatPrice(row.amount) }}</td>
              </tr>
              <tr v-if="stats.days.length === 0">
                <td colspan="3">Aucune commande trouvee.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="dashboard-section">
        <h2>Etats</h2>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Etat</th>
                <th>Nombre</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.states" :key="row.id">
                <td>{{ row.label }}</td>
                <td>{{ row.count }}</td>
                <td>{{ row.id === 'cart' ? '-' : formatPrice(row.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getDashboardStats, type DashboardStats } from '../services/dashboard.service'

const stats = ref<DashboardStats | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

function formatPrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDay(value: string): string {
  if (value === 'Sans date') return value
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('fr-FR')
}

async function loadStats(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''

  try {
    stats.value = await getDashboardStats()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Erreur tableau de bord.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadStats)
</script>

<style scoped>
.dashboard-view {
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px;
}

.dashboard-header {
  align-items: center;
  border-bottom: 2px solid #eee;
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 18px;
  gap: 1rem;
}

.dashboard-header h1 {
  color: #333;
  font-size: 28px;
  margin: 0 0 0.25rem;
}

.dashboard-header p {
  color: #6b7280;
  margin: 0;
}

.btn-refresh {
  background: #0066cc;
  border: 0;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  padding: 10px 16px;
}

.btn-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.summary-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 24px;
}

.summary-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
}

.summary-card span {
  color: #6b7280;
  font-size: 0.86rem;
}

.summary-card strong {
  color: #111827;
  font-size: 1.7rem;
}

.dashboard-section {
  margin-top: 24px;
}

.dashboard-section h2 {
  font-size: 1.15rem;
  margin: 0 0 0.75rem;
}

.table-wrapper {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow-x: auto;
}

table {
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

.message {
  border-radius: 4px;
  margin-bottom: 20px;
  padding: 12px 16px;
}

.message.error {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.message.info {
  background: #d1ecf1;
  border: 1px solid #bee5eb;
  color: #0c5460;
}
</style>
