<template>
  <div class="statistics-view page-content container p-md">
    <div class="statistics-header">
      <h1>Statistiques Financières</h1>
      <button class="btn-refresh" type="button" :disabled="isLoading" @click="loadStats">
        {{ isLoading ? 'Actualisation...' : 'Actualiser' }}
      </button>
    </div>

    <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
    <div v-if="isLoading && !stats" class="message info">Chargement des statistiques...</div>

    <template v-if="stats">
      <section class="summary-grid">
        <article class="summary-card">
          <span>Montant total des ventes (HT)</span>
          <strong>{{ formatPrice(stats.totalAmountHT) }}</strong>
        </article>
        <article class="summary-card">
          <span>Montant total d'achat (HT)</span>
          <strong>{{ formatPrice(stats.totalPurchaseHT) }}</strong>
        </article>
        <article class="summary-card">
          <span>Bénéfice global (HT)</span>
          <strong :class="{'profit-positive': stats.totalAmountHT - stats.totalPurchaseHT > 0, 'profit-negative': stats.totalAmountHT - stats.totalPurchaseHT < 0}">
            {{ formatPrice(stats.totalAmountHT - stats.totalPurchaseHT) }}
          </strong>
        </article>
      </section>

      <section class="statistics-section">
        <h2>Bénéfice par Catégorie</h2>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Ventes (HT)</th>
                <th>Achats (HT)</th>
                <th>Bénéfice (HT)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.profitsByCategory" :key="row.categoryId">
                <td>{{ row.categoryName }}</td>
                <td>{{ formatPrice(row.salesHT) }}</td>
                <td>{{ formatPrice(row.purchaseHT) }}</td>
                <td :class="{'profit-positive': row.profitHT > 0, 'profit-negative': row.profitHT < 0}">
                  {{ formatPrice(row.profitHT) }}
                </td>
              </tr>
              <tr v-if="stats.profitsByCategory.length === 0">
                <td colspan="4">Aucune donnée disponible.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getFinancialStats, type FinancialStats } from '../services/statistics.service'

const stats = ref<FinancialStats | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

function formatPrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

async function loadStats() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    stats.value = await getFinancialStats()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Erreur lors du chargement des statistiques.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadStats)
</script>

<style scoped>
.statistics-view {
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px;
}

.statistics-header {
  align-items: center;
  border-bottom: 2px solid #eee;
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 18px;
}

.statistics-header h1 {
  color: #333;
  font-size: 28px;
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

.statistics-section {
  margin-top: 24px;
}

.statistics-section h2 {
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

th, td {
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

.profit-positive {
  color: #10b981;
  font-weight: bold;
}

.profit-negative {
  color: #ef4444;
  font-weight: bold;
}
</style>
