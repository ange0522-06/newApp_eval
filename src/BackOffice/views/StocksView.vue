<template>
  <div class="stocks-view page-content container p-md">
    <div class="stocks-header">
      <h1>Stocks</h1>
      <button class="btn-refresh" type="button" :disabled="isLoading" @click="loadStocks">
        {{ isLoading ? 'Actualisation...' : 'Actualiser' }}
      </button>
    </div>

    <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
    <div v-if="successMessage" class="message success">{{ successMessage }}</div>
    <div v-if="isLoading && !stocks.length" class="message info">Chargement de l'analyse des stocks...</div>

    <section class="stock-editor">
      <h2>Ajouter ou mettre a jour le stock d'un produit</h2>
      <div class="editor-grid">
        <label>
          Produit
          <select v-model="selectedStockId">
            <option value="">Selectionner...</option>
            <option v-for="option in productStocks" :key="option.stockId" :value="option.stockId">
              {{ option.label }} - stock {{ option.quantity }}
            </option>
          </select>
        </label>

        <label>
          Quantite a ajouter
          <input v-model.number="quantityToAdd" type="number" min="0" />
        </label>

        <label>
          Nouvelle quantite disponible
          <input v-model.number="quantityToSet" type="number" min="0" />
        </label>
      </div>

      <div class="editor-actions">
        <button class="btn-action" type="button" :disabled="!selectedStock || isSaving" @click="addStock">
          Ajouter au stock
        </button>
        <button class="btn-action btn-action--dark" type="button" :disabled="!selectedStock || isSaving" @click="setStock">
          Mettre a jour
        </button>
      </div>
    </section>

    <section v-if="selectedStock" class="stock-history">
      <div class="section-header">
        <h2>Evolution journaliere - {{ selectedStock.label }}</h2>
        <button class="btn-refresh" type="button" :disabled="isHistoryLoading" @click="loadEvolution">
          {{ isHistoryLoading ? 'Chargement...' : 'Recharger' }}
        </button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entrees</th>
              <th>Sorties</th>
              <th>Solde estime</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in evolutionRows" :key="`${row.date}-${row.source}`">
              <td>{{ row.date }}</td>
              <td class="qty-cell text-success">{{ row.incomingQty }}</td>
              <td class="qty-cell text-danger">{{ row.outgoingQty }}</td>
              <td class="qty-cell"><strong>{{ row.balanceQty }}</strong></td>
              <td>{{ row.source }}</td>
            </tr>
            <tr v-if="!isHistoryLoading && evolutionRows.length === 0">
              <td colspan="5">Aucun mouvement journalier trouve pour ce produit.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Stock par categorie</h2>
      <div class="table-wrapper" v-if="stocks.length > 0">
        <table>
          <thead>
            <tr>
              <th>Categorie</th>
              <th>Qte physique</th>
              <th>Qte reservee</th>
              <th>Qte disponible</th>
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
        Aucune donnee de stock trouvee.
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  addProductStockQuantity,
  getProductStockOptions,
  getStockAnalysis,
  getStockEvolution,
  updateProductStockQuantity,
  type ProductStockOption,
  type StockCategoryRow,
  type StockEvolutionRow,
} from '../services/stocks.service';

const stocks = ref<StockCategoryRow[]>([]);
const productStocks = ref<ProductStockOption[]>([]);
const evolutionRows = ref<StockEvolutionRow[]>([]);
const selectedStockId = ref('');
const quantityToAdd = ref(0);
const quantityToSet = ref(0);
const isLoading = ref(false);
const isSaving = ref(false);
const isHistoryLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const selectedStock = computed(() =>
  productStocks.value.find((stock) => stock.stockId === selectedStockId.value) || null
);

async function loadStocks() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const [analysis, options] = await Promise.all([
      getStockAnalysis(),
      getProductStockOptions(),
    ]);
    stocks.value = analysis;
    productStocks.value = options;
    if (selectedStock.value) {
      quantityToSet.value = selectedStock.value.quantity;
      await loadEvolution();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Erreur lors du chargement des stocks';
  } finally {
    isLoading.value = false;
  }
}

async function persistSelectedStock(nextStock: ProductStockOption) {
  const index = productStocks.value.findIndex((stock) => stock.stockId === nextStock.stockId);
  if (index >= 0) productStocks.value[index] = nextStock;
  quantityToSet.value = nextStock.quantity;
  quantityToAdd.value = 0;
  successMessage.value = 'Stock mis a jour.';
  await loadStocks();
  await loadEvolution();
}

async function addStock() {
  if (!selectedStock.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  try {
    await persistSelectedStock(await addProductStockQuantity(selectedStock.value, quantityToAdd.value));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Ajout de stock impossible.';
  } finally {
    isSaving.value = false;
  }
}

async function setStock() {
  if (!selectedStock.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  try {
    await persistSelectedStock(await updateProductStockQuantity(selectedStock.value, quantityToSet.value));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Mise a jour du stock impossible.';
  } finally {
    isSaving.value = false;
  }
}

async function loadEvolution() {
  if (!selectedStock.value) {
    evolutionRows.value = [];
    return;
  }
  isHistoryLoading.value = true;
  try {
    evolutionRows.value = await getStockEvolution(selectedStock.value);
  } finally {
    isHistoryLoading.value = false;
  }
}

watch(selectedStock, (stock) => {
  quantityToSet.value = stock?.quantity || 0;
  quantityToAdd.value = 0;
  loadEvolution();
});

onMounted(loadStocks);
</script>

<style scoped>
.stocks-view {
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px;
}

.stocks-header,
.section-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.stocks-header {
  border-bottom: 2px solid #eee;
  margin-bottom: 24px;
  padding-bottom: 18px;
}

h1 {
  color: #333;
  font-size: 28px;
  margin: 0;
}

h2 {
  color: #1f2937;
  font-size: 1.15rem;
  margin: 0 0 0.8rem;
}

.stock-editor,
.stock-history,
section {
  margin-bottom: 24px;
}

.editor-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: minmax(240px, 1.5fr) minmax(150px, 0.6fr) minmax(170px, 0.7fr);
}

label {
  color: #374151;
  display: grid;
  font-weight: 700;
  gap: 0.35rem;
}

select,
input {
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font: inherit;
  padding: 0.6rem;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-refresh,
.btn-action {
  background: #0066cc;
  border: 0;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  padding: 10px 16px;
}

.btn-action--dark {
  background: #111827;
}

.btn-refresh:disabled,
.btn-action:disabled {
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

.qty-cell {
  font-family: monospace;
  font-size: 1.05rem;
  text-align: right;
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

.message.success {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

@media (max-width: 760px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }

  .stocks-header,
  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
