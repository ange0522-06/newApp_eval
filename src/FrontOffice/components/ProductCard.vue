<template>
  <div class="product-card">

    <!-- Image du produit -->
    <div class="product-card__media">
      <span
        v-if="product.releaseBadge"
        :class="['product-card__badge', `product-card__badge--${product.releaseBadge.toLowerCase()}`]"
      >
        {{ product.releaseBadge }}
      </span>
      <img
        :src="product.imageUrl"
        :alt="product.name"
        class="product-card__image"
        @error="onImageError"
      />
    </div>

    <!-- Informations du produit -->
    <div class="product-card__info">

      <!-- Nom -->
      <h3 class="product-card__name">{{ product.name }}</h3>

      <!-- Référence -->
      <p class="product-card__reference">Réf : {{ product.reference }}</p>

      <!-- Prix TTC -->
      <p class="product-card__price">{{ formatPrice(product.priceTTC) }}</p>

    </div>

    <!-- Bouton voir le produit -->
    <button class="product-card__btn" @click="goToProduct">
      Voir le produit
    </button>

  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { Product } from '../types/product.types'

// ─── Props ───────────────────────────────────────────────────────────────────

/**
 * Props = données reçues depuis le composant parent (HomeView)
 * ProductCard reçoit un objet Product complet
 * defineProps est la syntaxe Vue 3 Composition API pour déclarer les props
 */
const props = defineProps<{
  product: Product
}>()

// ─── Router ──────────────────────────────────────────────────────────────────

/**
 * useRouter() = accès au router Vue pour naviguer entre les pages
 * Equivalent de this.$router en Options API
 */
const router = useRouter()

// ─── Fonctions ───────────────────────────────────────────────────────────────

/**
 * Navigue vers la fiche produit
 * /product/:id → ProductView.vue recevra l'id via useRoute().params.id
 */
function goToProduct(): void {
  router.push(`/product/${props.product.id}`)
}

/**
 * Formate le prix en euros
 * ex: 12.5 → "12,50 €"
 * Intl.NumberFormat = API native du navigateur pour formater les nombres
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(price)
}

/**
 * Gère l'erreur si l'image ne se charge pas
 * Remplace l'image par une image par défaut
 * @error = événement natif HTML déclenché quand une image échoue à charger
 */
function onImageError(event: Event): void {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder.png'  // image par défaut à placer dans public/
}
</script>

<style scoped>
.product-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: white;
}

.product-card__media {
  position: relative;
}

.product-card__image {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 4px;
  background: #f5f5f5;
}

.product-card__badge {
  border-radius: 999px;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  left: 0.5rem;
  letter-spacing: 0;
  padding: 0.25rem 0.55rem;
  position: absolute;
  top: 0.5rem;
}

.product-card__badge--hot {
  background: #dc2626;
}

.product-card__badge--new {
  background: #2563eb;
}

.product-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.product-card__name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.product-card__reference {
  font-size: 0.8rem;
  color: #888;
  margin: 0;
}

.product-card__price {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2a7ae2;
  margin: 0;
}

.product-card__btn {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #2a7ae2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.product-card__btn:hover {
  background: #1a5fc8;
}
</style>
