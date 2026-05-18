<template>
  <div class="home">

    <!-- Filtre par catégories -->
    <div class="product-search">
      <div class="product-search__field product-search__field--wide">
        <label for="product-name">Nom du produit</label>
        <input
          id="product-name"
          v-model.trim="searchName"
          class="search-input"
          type="search"
          placeholder="Rechercher..."
        />
      </div>

      <div class="product-search__field">
        <label for="category-select">Categorie</label>
        <select id="category-select" v-model="selectedCategoryId" class="search-input">
          <option value="">Toutes</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
      </div>

      <div class="product-search__field">
        <label for="min-price">Prix min</label>
        <input id="min-price" v-model.number="minPrice" class="search-input" type="number" min="0" step="0.01" />
      </div>

      <div class="product-search__field">
        <label for="max-price">Prix max</label>
        <input id="max-price" v-model.number="maxPrice" class="search-input" type="number" min="0" step="0.01" />
      </div>

      <button class="clear-filters" type="button" @click="clearFilters">
        Effacer
      </button>
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
      Aucun produit ne correspond aux criteres.
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
const searchName = ref<string>('')
const minPrice = ref<number | null>(null)
const maxPrice = ref<number | null>(null)
const loadingState = ref<LoadingState>('idle')

// ─── Produits filtrés par catégorie ──────────────────────────────────────────

const filteredProducts = computed(() => {
  const query = normalize(searchName.value)
  const min = Number(minPrice.value)
  const max = Number(maxPrice.value)
  const hasMin = minPrice.value !== null && minPrice.value !== undefined && !Number.isNaN(min)
  const hasMax = maxPrice.value !== null && maxPrice.value !== undefined && !Number.isNaN(max)

  // Chaque critere est optionnel. Un produit doit seulement respecter les criteres remplis.
  return products.value.filter(product => {
    const matchName = !query || normalize(product.name).includes(query)
    const matchCategory = !selectedCategoryId.value || product.category_ids.includes(selectedCategoryId.value)
    const matchMin = !hasMin || product.priceTTC >= min
    const matchMax = !hasMax || product.priceTTC <= max
    return matchName && matchCategory && matchMin && matchMax
  })
})

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function clearFilters(): void {
  searchName.value = ''
  selectedCategoryId.value = ''
  minPrice.value = null
  maxPrice.value = null
}

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

.product-search {
  margin-bottom: 2rem;
  display: grid;
  grid-template-columns: minmax(180px, 1.25fr) minmax(160px, 1fr) minmax(110px, 0.65fr) minmax(110px, 0.65fr) minmax(88px, auto);
  align-items: end;
  gap: 0.75rem;
}

.product-search__field {
  display: grid;
  gap: 0.3rem;
}

.product-search__field label {
  font-weight: 600;
  color: #333;
  font-size: 0.85rem;
}

.search-input {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  min-width: 0;
}

.search-input:hover {
  border-color: #999;
}

.search-input:focus {
  outline: none;
  border-color: #0066cc;
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
}

.clear-filters {
  border: 0;
  border-radius: 4px;
  background: #111827;
  color: #fff;
  cursor: pointer;
  padding: 0.6rem 0.85rem;
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

@media (max-width: 720px) {
  .product-search {
    grid-template-columns: 1fr 1fr;
  }

  .clear-filters {
    grid-column: 1 / -1;
  }
}

@media (max-width: 560px) {
  .product-search {
    grid-template-columns: 1fr;
  }
}
</style>
