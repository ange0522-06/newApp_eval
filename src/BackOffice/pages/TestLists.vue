<script setup>
import { ref, reactive } from 'vue';
import { getAllIds, getOne } from '../services/prestashop.service.js';
import ListProductsTab from '../components/ListProductsTab.vue';
import ListClientsTab from '../components/ListClientsTab.vue';
import ListCommandesTab from '../components/ListCommandesTab.vue';
import ListStockTab from '../components/ListStockTab.vue';

const activeTab = ref('products');
const error = ref(null);
const lastCheck = ref(null);

const stats = reactive({
  products: 0,
  clients: 0,
  commandes: 0,
  stocks: 0,
  loading: false,
  message: ''
});

/**
 * Vérifie le statut de l'API et récupère les counts
 */
async function checkAPIStatus() {
  stats.loading = true;
  stats.message = 'Vérification de l\'API...';
  error.value = null;

  try {
    const [products, clients, commandes, stocks] = await Promise.all([
      getAllIds('products').catch(() => []),
      getAllIds('customers').catch(() => []),
      getAllIds('orders').catch(() => []),
      getAllIds('stock_availables').catch(() => [])
    ]);

    stats.products = products.length;
    stats.clients = clients.length;
    stats.commandes = commandes.length;
    stats.stocks = stocks.length;
    stats.message = '✅ API fonctionnelle !';
    lastCheck.value = new Date().toLocaleTimeString();
  } catch (err) {
    error.value = `Erreur API: ${err.message}`;
    stats.message = '❌ Erreur de connexion';
    console.error(err);
  } finally {
    stats.loading = false;
  }
}

// Vérifier au chargement
checkAPIStatus();
</script>

<template>
  <div class="test-lists-container">
    <!-- En-tête -->
    <div class="header">
      <div class="header-content">
        <h2>📊 Test des API PrestaShop</h2>
        <p class="subtitle">Vérifiez que les données sont accessibles avant la réinitialisation</p>
      </div>
      <button @click="checkAPIStatus" :disabled="stats.loading" class="btn-refresh">
        {{ stats.loading ? '⏳ Vérification...' : '🔄 Vérifier API' }}
      </button>
    </div>

    <!-- Message d'erreur -->
    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <!-- Status Cards -->
    <div class="status-cards">
      <div class="status-card">
        <div class="status-icon">📦</div>
        <div class="status-info">
          <div class="status-label">Produits</div>
          <div class="status-value">{{ stats.products }}</div>
        </div>
      </div>

      <div class="status-card">
        <div class="status-icon">👥</div>
        <div class="status-info">
          <div class="status-label">Clients</div>
          <div class="status-value">{{ stats.clients }}</div>
        </div>
      </div>

      <div class="status-card">
        <div class="status-icon">📋</div>
        <div class="status-info">
          <div class="status-label">Commandes</div>
          <div class="status-value">{{ stats.commandes }}</div>
        </div>
      </div>

      <div class="status-card">
        <div class="status-icon">📊</div>
        <div class="status-info">
          <div class="status-label">Stocks</div>
          <div class="status-value">{{ stats.stocks }}</div>
        </div>
      </div>
    </div>

    <!-- Status Message -->
    <div class="status-message">
      {{ stats.message }}
      <span v-if="lastCheck" class="last-check">Dernière vérification: {{ lastCheck }}</span>
    </div>

    <!-- Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          v-for="tab in ['products', 'clients', 'commandes', 'stocks']"
          :key="tab"
          :class="['tab-button', { active: activeTab === tab }]"
          @click="activeTab = tab"
        >
          {{ tab === 'products' ? '📦 Produits' : 
             tab === 'clients' ? '👥 Clients' : 
             tab === 'commandes' ? '📋 Commandes' : 
             '📊 Stocks' }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tabs-content">
        <ListProductsTab v-if="activeTab === 'products'" />
        <ListClientsTab v-if="activeTab === 'clients'" />
        <ListCommandesTab v-if="activeTab === 'commandes'" />
        <ListStockTab v-if="activeTab === 'stocks'" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-lists-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.header {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header-content h2 {
  margin: 0 0 0.5rem 0;
  color: #333;
  font-size: 1.8rem;
}

.subtitle {
  margin: 0;
  color: #666;
  font-size: 0.95rem;
}

.btn-refresh {
  padding: 0.75rem 1.5rem;
  background: #25B9D7;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn-refresh:hover:not(:disabled) {
  background: #0D6B82;
  box-shadow: 0 2px 8px rgba(13, 107, 130, 0.2);
}

.btn-refresh:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.alert {
  padding: 1rem;
  border-radius: 8px;
  background: #fee;
  border: 2px solid #f88;
  color: #c33;
  font-weight: 600;
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.status-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.status-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
}

.status-icon {
  font-size: 2.5rem;
}

.status-info {
  flex: 1;
}

.status-label {
  font-size: 0.9rem;
  color: #999;
  font-weight: 600;
  text-transform: uppercase;
}

.status-value {
  font-size: 2rem;
  font-weight: 700;
  color: #25B9D7;
}

.status-message {
  text-align: center;
  color: #0D6B82;
  font-weight: 600;
  padding: 1rem;
  background: #f0f8fa;
  border-left: 4px solid #25B9D7;
  border-radius: 4px;
}

.last-check {
  display: block;
  font-size: 0.85rem;
  opacity: 0.9;
  margin-top: 0.5rem;
}

.tabs-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.tabs {
  display: flex;
  border-bottom: 2px solid #eee;
  background: #f9f9f9;
}

.tab-button {
  flex: 1;
  padding: 1.5rem;
  border: none;
  background: transparent;
  color: #666;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}

.tab-button:hover {
  background: #f0f0f0;
  color: #333;
}

.tab-button.active {
  color: #25B9D7;
  border-bottom-color: #25B9D7;
}

.tabs-content {
  padding: 2rem;
  min-height: 300px;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }

  .status-cards {
    grid-template-columns: 1fr 1fr;
  }

  .tabs {
    flex-wrap: wrap;
  }

  .tab-button {
    flex: 0 1 50%;
    padding: 1rem;
  }
}
</style>
