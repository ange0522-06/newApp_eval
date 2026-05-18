<template>
  <div class="stocks-view page-content container p-md">
    <div class="stocks-header">
      <h1>Analyse des Stocks</h1>
      <button class="btn-refresh" type="button" :disabled="isLoading" @click="loadStocks">
        {{ isLoading ? 'Actualisation...' : 'Actualiser' }}
      </button>
    </div>

    <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
    <div v-if="isLoading && !stocks.length" class="message info">Chargement de l'analyse des stocks...</div>

    <div class="table-wrapper" v-if="stocks.length > 0">
      <table>
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Qté physique</th>
            <th>Qté reservée</th>
            <th>Qté disponible</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in stocks" :key="row.categoryId">
            <td>{{ row.categoryName }}</td>
            <td class="qty-cell">{{ row.physicalQty }}</td>
            <td class="qty-cell text-warning">{{ row.reservedQty }}</td>
            <td class="qty-cell" :class="{'text-success': row.availableQty > 0, 'text-danger': row.availableQty <= 0}">
              <strong>{{ row.availableQty }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!isLoading && stocks.length === 0" class="message info">
      Aucune donnée de stock trouvée.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getStockAnalysis, type StockCategoryRow } from '../services/stocks.service';

const stocks = ref<StockCategoryRow[]>([]);
const isLoading = ref(false);
const errorMessage = ref('');

async function loadStocks() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    stocks.value = await getStockAnalysis();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Erreur lors du chargement des stocks';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadStocks);
</script>

<style scoped>
.stocks-view {
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px;
}

.stocks-header {
  align-items: center;
  border-bottom: 2px solid #eee;
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 18px;
}

.stocks-header h1 {
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

.qty-cell {
  text-align: right;
  font-family: monospace;
  font-size: 1.1rem;
}

.text-warning {
  color: #f59e0b;
}

.text-success {
  color: #10b981;
}

.text-danger {
  color: #ef4444;
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
