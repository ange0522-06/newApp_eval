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

        <!-- Infos chargées - LECTURE SEULE -->
        <div v-if="customerLoaded" class="customer-info">
          <h3>Informations du client</h3>
          
          <div class="info-row">
            <div class="info-group">
              <label>Prénom</label>
              <p>{{ firstname || '(non renseigné)' }}</p>
            </div>
            <div class="info-group">
              <label>Nom</label>
              <p>{{ lastname || '(non renseigné)' }}</p>
            </div>
          </div>

          <div class="info-row">
            <div class="info-group full">
              <label>Adresse</label>
              <p>{{ address1 || '(non renseignée)' }}</p>
            </div>
          </div>

          <div class="info-row">
            <div class="info-group">
              <label>Ville</label>
              <p>{{ city || '(non renseignée)' }}</p>
            </div>
            <div class="info-group">
              <label>Code postal</label>
              <p>{{ postcode || '(non renseigné)' }}</p>
            </div>
          </div>

          <div class="info-row">
            <div class="info-group">
              <label>Téléphone</label>
              <p>{{ phone || '(non renseigné)' }}</p>
            </div>
          </div>

          <p class="info-note">
            ✏️ Pour modifier ces infos, allez à <router-link to="/profile">mon profil</router-link>
          </p>
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
          :disabled="isPlacing || !cart.items.length || !email || !customerLoaded"
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart.store'
import { getOne, getAllIds } from '@/shared/services/prestashop.service.js'

const cart = useCartStore()
const router = useRouter()

const email = ref('')
const firstname = ref('')
const lastname = ref('')
const address1 = ref('')
const city = ref('')
const postcode = ref('')
const phone = ref('')
const isPlacing = ref(false)
const result = ref<any>(null)
const formError = ref('')
const isLoading = ref(true)
const customerLoaded = ref(false)

const isAuthenticated = computed(() =>
  localStorage.getItem('auth_authenticated') === 'true' &&
  localStorage.getItem('auth_email') !== null
)

const total = computed(() => cart.totalTTC)

function formatPrice(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

/**
 * Charge les infos du client à partir de son email
 * Appelée quand l'utilisateur saisit l'email
 */
async function loadCustomerByEmail(emailToSearch: string) {
  if (!emailToSearch || emailToSearch.trim() === '') {
    customerLoaded.value = false
    firstname.value = ''
    lastname.value = ''
    address1.value = ''
    city.value = ''
    postcode.value = ''
    phone.value = ''
    return
  }

  try {
    customerLoaded.value = false

    // Trouver le client par email
    const customerIds = await getAllIds('customers')
    for (const id of customerIds) {
      const customer: any = await getOne('customers', id)
      if (customer && customer.email === emailToSearch) {
        firstname.value = customer.firstname || ''
        lastname.value = customer.lastname || ''
        phone.value = customer.phone || ''

        // Récupérer l'adresse par défaut si elle existe
        if (customer.id_default_address && customer.id_default_address !== '0') {
          try {
            const address: any = await getOne('addresses', customer.id_default_address)
            address1.value = address.address1 || ''
            city.value = address.city || ''
            postcode.value = address.postcode || ''
            phone.value = address.phone || phone.value
          } catch {
            // Pas d'adresse par défaut
          }
        }

        customerLoaded.value = true
        return
      }
    }

    // Client non trouvé
    formError.value = `❌ Aucun client trouvé avec l'email: ${emailToSearch}`
    customerLoaded.value = false
  } catch (err) {
    console.error('Erreur chargement client:', err)
    formError.value = 'Erreur lors de la recherche du client'
    customerLoaded.value = false
  }
}

// Observer l'email - charger les infos du client automatiquement
watch(
  () => email.value,
  (newEmail) => {
    formError.value = ''
    if (newEmail.includes('@')) {
      loadCustomerByEmail(newEmail)
    }
  }
)

async function handleSubmit() {
  formError.value = ''

  if (!email.value) {
    formError.value = 'Veuillez entrer un email'
    return
  }

  if (!customerLoaded.value) {
    formError.value = `❌ Client non trouvé avec l'email: ${email.value}`
    return
  }

  if (!firstname.value || !lastname.value || !address1.value || !city.value || !postcode.value) {
    formError.value = '❌ Les infos du client sont incomplètes. Complétez le profil du client d\'abord.'
    return
  }

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

/* CUSTOMER INFO - LECTURE SEULE */
.customer-info {
  background: #f9f9f9;
  border-left: 4px solid #28a745;
  padding: 1.5rem;
  border-radius: 4px;
}

.customer-info h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
}

.info-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.info-row .full {
  grid-column: 1 / -1;
}

.info-group label {
  display: block;
  font-size: 0.85rem;
  color: #666;
  text-transform: uppercase;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.info-group p {
  margin: 0;
  padding: 0.5rem;
  background: white;
  border-radius: 4px;
  color: #333;
  min-height: 2rem;
  display: flex;
  align-items: center;
}

.info-note {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #e3f2fd;
  color: #1565c0;
  border-radius: 4px;
  font-size: 0.9rem;
  margin-bottom: 0;
}

.info-note a {
  color: #2a7ae2;
  text-decoration: underline;
  cursor: pointer;
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
