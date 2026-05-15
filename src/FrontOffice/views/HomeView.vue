<template>
  <div class="home">

    <!-- Filtre par catégories -->
    <div class="category-filter">
      <select id="category-select" v-model="selectedCategoryId" class="category-select">
        <option value="">Tous les produits</option>
        <option v-for="category in categories" :key="category.id" :value="category.id">
          {{ category.name }}
        </option>
      </select>
    </div>

    <!-- État : chargement initial (avant le premier produit) -->
    <div v-if="loadingState === 'loading' && filteredProducts.length === 0">
      Chargement des produits...
    </div>

    <!-- État : erreur -->
    <div v-else-if="loadingState === 'error'">
      Erreur lors du chargement des produits.
    </div>

    <!-- État : aucun produit après chargement complet -->
    <div v-else-if="loadingState === 'success' && filteredProducts.length === 0">
      Aucun produit disponible.
    </div>

    <!--
      SOLUTION 3 : Affichage progressif
      La grille s'affiche dès le premier produit chargé
      Les produits apparaissent au fur et à mesure sans attendre la fin
      v-show au lieu de v-if = le DOM existe dès le départ (plus rapide)
    -->
    <div v-show="filteredProducts.length > 0" class="products-grid">
      <ProductCard
        v-for="product in filteredProducts"
        :key="product.id"
        :product="product"
      />
    </div>

    <!-- Indicateur discret pendant chargement en cours -->
    <div v-if="loadingState === 'loading' && filteredProducts.length > 0" class="loading-more">
      Chargement en cours...
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAllProducts, getAllCategories } from '../services/product.service'
import ProductCard from '../components/ProductCard.vue'
import type { Product, LoadingState, Category } from '../types/product.types'

// ─── État ────────────────────────────────────────────────────────────────────

const products = ref<Product[]>([])
const categories = ref<Category[]>([])
const selectedCategoryId = ref<string>('')
const loadingState = ref<LoadingState>('idle')

// ─── Produits filtrés par catégorie ──────────────────────────────────────────

const filteredProducts = computed(() => {
  if (!selectedCategoryId.value) {
    return products.value
  }
  return products.value.filter(p => p.category_ids.includes(selectedCategoryId.value))
})

// ─── Chargement des catégories ──────────────────────────────────────────────

async function loadCategories(): Promise<void> {
  try {
    categories.value = await getAllCategories()
  } catch (error) {
    console.error('Erreur loadCategories:', error)
  }
}

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

onMounted(async () => {
  await loadCategories()
  await loadProducts()
})
</script>

<style scoped>
.home {
  padding: 1rem;
}

.category-filter {
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.category-filter label {
  font-weight: 600;
  color: #333;
}

.category-select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  min-width: 200px;
}

.category-select:hover {
  border-color: #999;
}

.category-select:focus {
  outline: none;
  border-color: #0066cc;
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
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