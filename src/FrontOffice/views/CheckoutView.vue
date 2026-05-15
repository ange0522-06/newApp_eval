<template>
  <div class="checkout">
    <h1>Validation de la commande</h1>

    <div v-if="!cart.items.length">
      Votre panier est vide.
    </div>

    <div v-else>
      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>Prénom</label>
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

        <div class="summary">
          <p>Montant total : {{ formatPrice(total) }}</p>
          <p>Mode de paiement disponible : Paiement à la livraison</p>
          <p>Frais de livraison : Gratuit</p>
        </div>

        <button class="btn-order" :disabled="isPlacing">Commander</button>
      </form>

      <div v-if="result">
        <p v-if="result.success">Commande créée (ID: {{ result.orderId }})</p>
        <p v-else>Erreur: {{ result.error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCartStore } from '../stores/cart.store'
import { useRouter } from 'vue-router'

const cart = useCartStore()
const router = useRouter()

const firstname = ref('')
const lastname = ref('')
const address1 = ref('')
const city = ref('')
const postcode = ref('')
const isPlacing = ref(false)
const result = ref<any>(null)

const total = computed(() => cart.items.reduce((s, i) => s + i.price * i.quantity, 0))

function formatPrice(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

async function handleSubmit() {
  isPlacing.value = true
  result.value = null

  const res = await cart.placeOrder({
    firstname: firstname.value,
    lastname: lastname.value,
    address1: address1.value,
    city: city.value,
    postcode: postcode.value,
  })

  result.value = res
  isPlacing.value = false

  if (res && res.success) {
    // redirect to home or order page
    router.push('/home')
  }
}
</script>

<style scoped>
.checkout { max-width: 700px; margin: 1rem auto; padding: 1rem }
.field { margin-bottom: 0.75rem }
.btn-order { background: #2a7ae2; color: white; padding: 0.6rem 1rem; border: none }
.summary { margin-top: 1rem; padding: 1rem; border: 1px solid #eee }
</style>
