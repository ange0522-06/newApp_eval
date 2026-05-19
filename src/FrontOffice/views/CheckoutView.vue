<template>
  <div class="checkout">
    <h1>Validation de la commande</h1>

    <div v-if="!cart.items.length && !result?.success" class="empty-checkout">
      Votre panier est vide.
      <button type="button" class="btn-order" @click="router.push('/home')">Voir les produits</button>
    </div>

    <div v-else-if="isLoading" class="loading">
      ⏳ Chargement des informations...
    </div>

    <div v-else-if="!result?.success">
      <form @submit.prevent="handleSubmit">
        <p v-if="formError" class="error">{{ formError }}</p>
        
        <!-- SEUL L'EMAIL à saisir -->
        <div class="field email-field">
          <label>Email du client</label>
          <input v-model="email" type="email" required placeholder="Ex: votre@email.com" />
          <small>Entrez l'email du client existant</small>
        </div>

        <!-- Résumé panier -->
        <div class="summary">
          <h3>Résumé de la commande</h3>
          <div v-for="item in cart.items" :key="item.productId + (item.combinationId || '')" class="cart-item">
            <span>{{ item.name }} x{{ item.quantity }}</span>
            <strong>{{ formatPrice(item.price * item.quantity) }}</strong>
          </div>

          <div class="summary-row">
            <span>Sous-total</span>
            <strong>{{ formatPrice(total) }}</strong>
          </div>
          <div class="summary-row">
            <span>Frais de livraison</span>
            <strong>Gratuit</strong>
          </div>
          <div class="summary-row summary-row--total">
            <span>Total</span>
            <strong>{{ formatPrice(total) }}</strong>
          </div>
        </div>

        <button 
          class="btn-order" 
          :disabled="isPlacing || !cart.items.length || !email"
          @click="handleSubmit"
        >
          {{ isPlacing ? '⏳ Création de la commande...' : '✅ Commander' }}
        </button>
      </form>

      <p v-if="result && !result.success" class="error">❌ Erreur: {{ result.error }}</p>
    </div>

    <div v-else class="success">
      <p>✅ Commande créée (ID: {{ result.orderId }})</p>
      <p>Le paiement se fera à la livraison.</p>
      <button type="button" class="btn-order" @click="router.push('/home')">
        Retour boutique
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart.store'

const cart = useCartStore()
const router = useRouter()

const email = ref('')
const isPlacing = ref(false)
const result = ref<any>(null)
const formError = ref('')
const isLoading = ref(true)

const isAuthenticated = computed(() =>
  localStorage.getItem('auth_authenticated') === 'true' &&
  localStorage.getItem('auth_email') !== null
)

const total = computed(() => cart.totalTTC)

function formatPrice(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

async function handleSubmit() {
  formError.value = ''

  if (!email.value) {
    formError.value = 'Veuillez entrer un email'
    return
  }

  isPlacing.value = true
  result.value = null

  const res = await cart.placeOrder({ email: email.value })

  result.value = res
  isPlacing.value = false

  if (res && res.success) {
    setTimeout(() => {
      router.push('/home')
    }, 2000)
  }
}

onMounted(() => {
  isLoading.value = false

  // Si connecté, pré-remplir l'email
  if (isAuthenticated.value) {
    email.value = localStorage.getItem('auth_email') || ''
  }
})
</script>

<style scoped>
.checkout {
  max-width: 700px;
  margin: 1rem auto;
  padding: 1.5rem;
}

h1 {
  color: #333;
  margin-bottom: 2rem;
  border-bottom: 3px solid #2a7ae2;
  padding-bottom: 1rem;
}

.empty-checkout,
.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 1.1rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.error {
  padding: 1rem;
  background: #f8d7da;
  color: #721c24;
  border-radius: 4px;
  border: 1px solid #f5c6cb;
  margin: 0;
}

/* EMAIL FIELD - Seul champ modifiable */
.email-field {
  background: #f0f9ff;
  padding: 1rem;
  border-radius: 8px;
  border: 2px solid #2a7ae2;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  display: block;
  font-weight: bold;
  color: #333;
}

.field small {
  display: block;
  color: #999;
  font-size: 0.85rem;
}

.field input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.field input:focus {
  outline: none;
  border-color: #2a7ae2;
  box-shadow: 0 0 4px rgba(42, 122, 226, 0.3);
}

/* SUMMARY */
.summary {
  background: #f5f5f5;
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.summary h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #ddd;
  margin-bottom: 0.5rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  color: #666;
}

.summary-row--total {
  border-top: 2px solid #333;
  padding-top: 1rem;
  margin-top: 1rem;
  font-size: 1.2rem;
  color: #333;
  font-weight: bold;
}

.summary-row strong {
  color: #333;
  font-weight: bold;
}

/* BUTTONS */
.btn-order {
  padding: 1rem;
  background: #2a7ae2;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  transition: all 0.3s;
  margin-top: 1rem;
}

.btn-order:hover:not(:disabled) {
  background: #1e5ba8;
  box-shadow: 0 4px 12px rgba(42, 122, 226, 0.3);
  transform: translateY(-2px);
}

.btn-order:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.success {
  background: #d4edda;
  border: 2px solid #28a745;
  color: #155724;
  padding: 2rem;
  border-radius: 8px;
  text-align: center;
}

.success p {
  margin: 1rem 0;
  font-size: 1.1rem;
}

@media (max-width: 600px) {
  .checkout {
    padding: 1rem;
  }

  .info-row {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 1.5rem;
  }
}
</style>