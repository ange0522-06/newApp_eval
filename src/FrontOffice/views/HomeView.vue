<template>
  <div class="home">

    <!-- État : chargement initial (avant le premier produit) -->
    <div v-if="loadingState === 'loading' && products.length === 0">
      Chargement des produits...
    </div>

    <!-- État : erreur -->
    <div v-else-if="loadingState === 'error'">
      Erreur lors du chargement des produits.
    </div>

    <!-- État : aucun produit après chargement complet -->
    <div v-else-if="loadingState === 'success' && products.length === 0">
      Aucun produit disponible.
    </div>

    <!--
      SOLUTION 3 : Affichage progressif
      La grille s'affiche dès le premier produit chargé
      Les produits apparaissent au fur et à mesure sans attendre la fin
      v-show au lieu de v-if = le DOM existe dès le départ (plus rapide)
    -->
    <div v-show="products.length > 0" class="products-grid">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
      />
    </div>

    <!-- Indicateur discret pendant chargement en cours -->
    <div v-if="loadingState === 'loading' && products.length > 0" class="loading-more">
      Chargement en cours...
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAllProducts } from '../services/product.service'
import ProductCard from '../components/ProductCard.vue'
import type { Product, LoadingState } from '../types/product.types'

// ─── État ────────────────────────────────────────────────────────────────────

const products = ref<Product[]>([])
const loadingState = ref<LoadingState>('idle')

// ─── Chargement des produits ─────────────────────────────────────────────────

async function loadProducts(): Promise<void> {
  loadingState.value = 'loading'
  products.value = []

  try {
    /**
     * SOLUTION 3 : callback onProductLoaded
     * Appelé par product.service.ts dès qu'un produit est prêt
     * → Le produit s'affiche immédiatement sans attendre les autres
     * → L'utilisateur voit les produits apparaître un à un
     */
    await getAllProducts((product: Product) => {
      products.value.push(product)
    })

    loadingState.value = 'success'

  } catch (error) {
    console.error('Erreur loadProducts:', error)
    loadingState.value = 'error'
  }
}

// ─── Cycle de vie ────────────────────────────────────────────────────────────

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

.loading-more {
  text-align: center;
  padding: 1rem;
  color: #888;
  font-size: 0.9rem;
}
</style>