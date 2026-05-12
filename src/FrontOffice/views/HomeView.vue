<template>
  <div class="home">

    <!-- État : chargement -->
    <div v-if="loadingState === 'loading'">
      Chargement des produits...
    </div>

    <!-- État : erreur -->
    <div v-else-if="loadingState === 'error'">
      Erreur lors du chargement des produits.
    </div>

    <!-- État : aucun produit -->
    <div v-else-if="loadingState === 'success' && products.length === 0">
      Aucun produit disponible.
    </div>

    <!-- État : succès → grille de produits -->
    <div v-else-if="loadingState === 'success'" class="products-grid">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAllProducts } from '../services/product.service'
import ProductCard from '../components/ProductCard.vue'
import type { Product, LoadingState } from '../types/product.types'

// ─── État ────────────────────────────────────────────────────────────────────

/**
 * Liste des produits récupérés depuis l'API PrestaShop
 * ref([]) = tableau vide au départ, se remplit après l'appel API
 */
const products = ref<Product[]>([])

/**
 * État du chargement — contrôle ce qui est affiché dans le template
 * 'idle'    → page vient de s'ouvrir
 * 'loading' → appel API en cours
 * 'success' → données reçues
 * 'error'   → appel échoué
 */
const loadingState = ref<LoadingState>('idle')

// ─── Chargement des produits ─────────────────────────────────────────────────

/**
 * Charge tous les produits depuis PrestaShop
 * Appelée automatiquement au montage du composant via onMounted()
 */
async function loadProducts(): Promise<void> {
  // Passer en état "loading" pour afficher le message de chargement
  loadingState.value = 'loading'

  try {
    // Appel API → récupère tous les produits actifs
    // getAllProducts() est dans product.service.ts
    products.value = await getAllProducts()

    // Tout s'est bien passé → afficher les produits
    loadingState.value = 'success'

  } catch (error) {
    // Une erreur s'est produite → afficher le message d'erreur
    console.error('Erreur loadProducts:', error)
    loadingState.value = 'error'
  }
}

// ─── Cycle de vie ────────────────────────────────────────────────────────────

/**
 * onMounted = s'exécute automatiquement quand le composant
 * est inséré dans le DOM (équivalent de created() en Options API)
 * On charge les produits dès que la page s'ouvre
 */
onMounted(() => {
  loadProducts()
})
</script>

<style scoped>
.home {
  padding: 1rem;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
</style>