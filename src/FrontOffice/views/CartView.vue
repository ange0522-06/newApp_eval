<template>
  <div class="cart-view">
    <header class="cart-header">
      <h1>Panier</h1>
      <button v-if="cart.items.length" class="link-button" type="button" @click="cart.clear()">
        Vider le panier
      </button>
    </header>

    <div v-if="!cart.items.length" class="empty-cart">
      <p>Votre panier est vide.</p>
      <button type="button" class="primary-button" @click="router.push('/home')">
        Voir les produits
      </button>
    </div>

    <div v-else class="cart-layout">
      <section class="cart-lines" aria-label="Articles du panier">
        <p v-if="cart.stockError" class="stock-error">{{ cart.stockError }}</p>
        <article
          v-for="item in cart.items"
          :key="`${item.productId}-${item.combinationId || 0}`"
          class="cart-line"
        >
          <img :src="item.imageUrl || '/placeholder.png'" :alt="item.name" class="cart-line__image" />

          <div class="cart-line__details">
            <h2>{{ item.name }}</h2>
            <p v-if="item.reference" class="cart-line__meta">Ref : {{ item.reference }}</p>
            <p v-if="item.stock !== undefined" class="cart-line__meta">Stock restant : {{ item.stock }}</p>
            <p class="cart-line__price">{{ formatPrice(getLineUnitPrice(item)) }}</p>
          </div>

          <div class="cart-line__quantity">
            <button
              type="button"
              aria-label="Diminuer la quantite"
              @click="cart.updateQuantity(item.productId, item.combinationId, item.quantity - 1)"
            >
              -
            </button>
            <input
              :value="item.quantity"
              type="number"
              min="1"
              :max="item.stock"
              @input="updateQuantity(item, $event)"
            />
            <button
              type="button"
              aria-label="Augmenter la quantite"
              :disabled="item.stock !== undefined && item.quantity >= item.stock"
              @click="cart.updateQuantity(item.productId, item.combinationId, item.quantity + 1)"
            >
              +
            </button>
          </div>

          <div class="cart-line__total">
            {{ formatPrice(getLineUnitPrice(item) * item.quantity) }}
          </div>

          <button
            type="button"
            class="remove-button"
            @click="cart.removeItem(item.productId, item.combinationId)"
          >
            Supprimer
          </button>
        </article>
      </section>

      <aside class="cart-summary">
        <h2>Resume</h2>
        <div class="summary-row">
          <span>Sous-total</span>
          <strong>{{ formatPrice(cart.totalTTC) }}</strong>
        </div>
        <div class="summary-row">
          <span>Livraison</span>
          <strong>Gratuite</strong>
        </div>
        <div class="summary-row summary-row--total">
          <span>Total</span>
          <strong>{{ formatPrice(cart.totalTTC) }}</strong>
        </div>
        <p class="payment-note">Paiement a la livraison uniquement.</p>
        <button type="button" class="primary-button" @click="goCheckout">
          Valider la commande
        </button>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useCartStore, type CartItem } from '../stores/cart.store'

const router = useRouter()
const cart = useCartStore()

function getLineUnitPrice(item: CartItem): number {
  return item.priceTTC ?? item.price ?? 0
}

function updateQuantity(item: CartItem, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  cart.updateQuantity(item.productId, item.combinationId, Number.isFinite(value) ? value : 1)
}

function goCheckout() {
  const stockCheck = cart.validateCartStock()
  if (stockCheck.success) {
    router.push('/checkout')
  }
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}
</script>

<style scoped>
.cart-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
}

.cart-header,
.cart-layout,
.cart-line,
.summary-row {
  display: flex;
  align-items: center;
}

.cart-header {
  justify-content: space-between;
  margin-bottom: 1rem;
}

.empty-cart {
  display: grid;
  gap: 1rem;
  justify-items: start;
  padding: 2rem 0;
}

.cart-layout {
  align-items: flex-start;
  gap: 1.5rem;
}

.cart-lines {
  flex: 1;
  display: grid;
  gap: 0.75rem;
}

.cart-line {
  gap: 1rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem;
}

.cart-line__image {
  width: 84px;
  height: 84px;
  object-fit: cover;
  border-radius: 6px;
  background: #f3f4f6;
}

.cart-line__details {
  flex: 1;
  min-width: 160px;
}

.cart-line__details h2,
.cart-summary h2 {
  font-size: 1rem;
  margin: 0 0 0.25rem;
}

.cart-line__meta,
.payment-note {
  color: #6b7280;
  font-size: 0.9rem;
}

.cart-line__price,
.cart-line__total {
  font-weight: 700;
}

.cart-line__quantity {
  display: grid;
  grid-template-columns: 34px 54px 34px;
  height: 34px;
}

.cart-line__quantity button,
.cart-line__quantity input {
  border: 1px solid #d1d5db;
  background: #fff;
  text-align: center;
}

.cart-line__quantity button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cart-line__quantity input {
  border-left: 0;
  border-right: 0;
}

.cart-summary {
  width: 320px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
}

.summary-row {
  justify-content: space-between;
  padding: 0.5rem 0;
}

.summary-row--total {
  border-top: 1px solid #e5e7eb;
  margin-top: 0.5rem;
  font-size: 1.1rem;
}

.primary-button,
.link-button,
.remove-button {
  cursor: pointer;
  border-radius: 4px;
  border: 0;
}

.primary-button {
  width: 100%;
  background: #2a7ae2;
  color: #fff;
  padding: 0.75rem 1rem;
  font-weight: 700;
}

.link-button,
.remove-button {
  background: transparent;
  color: #2a7ae2;
}

.remove-button {
  color: #c0392b;
}

.stock-error {
  color: #c0392b;
  background: #fdecea;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  padding: 0.75rem;
}

@media (max-width: 780px) {
  .cart-layout,
  .cart-line {
    flex-direction: column;
    align-items: stretch;
  }

  .cart-summary {
    width: 100%;
  }

  .cart-line__image {
    width: 100%;
    height: 180px;
  }
}
</style>
