<template>
  <div class="checkout">
    <h1>Validation de la commande</h1>

    <div v-if="!cart.items.length && !result?.success" class="empty-checkout">
      Votre panier est vide.
      <button type="button" class="btn-order" @click="router.push('/home')">Voir les produits</button>
    </div>

    <div v-else-if="!result?.success">
      <form @submit.prevent="handleSubmit">
        <p v-if="formError" class="error">{{ formError }}</p>
        <div class="field">
          <label>Prenom</label>
          <input v-model="firstname" required />
        </div>
        <div class="field">
          <label>Nom</label>
          <input v-model="lastname" required />
        </div>
        <div class="field">
          <label>Adresse</label>
          <input v-model="address1" required />
        </div>
        <div class="field">
          <label>Ville</label>
          <input v-model="city" required />
        </div>
        <div class="field">
          <label>Code postal</label>
          <input v-model="postcode" required />
        </div>
        <div class="field">
          <label>Telephone</label>
          <input v-model="phone" />
        </div>

        <div class="summary">
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
          <p>Mode de paiement disponible : Paiement a la livraison</p>
        </div>

        <button class="btn-order" :disabled="isPlacing || !cart.items.length">
          {{ isPlacing ? 'Creation de la commande...' : 'Commander' }}
        </button>
      </form>

      <p v-if="cart.stockError" class="error">{{ cart.stockError }}</p>
      <p v-if="result && !result.success" class="error">Erreur: {{ result.error }}</p>
    </div>

    <div v-else class="success">
      <p>Commande creee (ID: {{ result.orderId }})</p>
      <p>Le paiement se fera a la livraison.</p>
      <button type="button" class="btn-order" @click="router.push('/home')">
        Retour boutique
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart.store'

const cart = useCartStore()
const router = useRouter()

const firstname = ref('')
const lastname = ref('')
const address1 = ref('')
const city = ref('')
const postcode = ref('')
const phone = ref('')
const isPlacing = ref(false)
const result = ref<any>(null)
const formError = ref('')

const total = computed(() => cart.totalTTC)

function formatPrice(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

async function handleSubmit() {
  formError.value = ''
  if (!firstname.value || !lastname.value || !address1.value || !city.value || !postcode.value) {
    formError.value = 'Prenom, nom, adresse, ville et code postal sont requis.'
    return
  }

  const stockCheck = cart.validateCartStock()
  if (!stockCheck.success) return

  isPlacing.value = true
  result.value = null

  const res = await cart.placeOrder({
    firstname: firstname.value,
    lastname: lastname.value,
    address1: address1.value,
    city: city.value,
    postcode: postcode.value,
    phone: phone.value,
  })

  result.value = res
  isPlacing.value = false
}
</script>

<style scoped>
.checkout {
  max-width: 720px;
  margin: 1rem auto;
  padding: 1rem;
}

.field {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.field input {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0.6rem;
}

.btn-order {
  background: #2a7ae2;
  color: white;
  padding: 0.7rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
}

.btn-order:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.summary {
  display: grid;
  gap: 0.5rem;
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.summary-row {
  display: flex;
  justify-content: space-between;
}

.summary-row--total {
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}

.empty-checkout,
.success {
  display: grid;
  gap: 1rem;
  justify-items: start;
}

.error {
  margin-top: 1rem;
  color: #c0392b;
}
</style>
