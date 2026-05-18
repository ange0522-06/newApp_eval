<template>
  <section class="customer-select">
    <div class="customer-select__header">
      <p class="customer-select__eyebrow">FrontOffice</p>
      <h1>Choisir un utilisateur</h1>
      <p>Selectionnez le client avec lequel vous voulez faire un achat.</p>
    </div>

    <div v-if="loadingState === 'loading'" class="state-box">
      Chargement des utilisateurs...
    </div>

    <div v-else-if="loadingState === 'error'" class="state-box state-box--error">
      Impossible de charger les utilisateurs.
      <button type="button" @click="loadCustomers">Reessayer</button>
    </div>

    <div v-else-if="customers.length === 0" class="state-box">
      Aucun utilisateur existant.
      <button v-if="!requiresExistingCustomer" type="button" @click="selectAnonymous">Continuer en anonyme</button>
      <button type="button" @click="goRegister">Creer un client</button>
    </div>

    <div v-else class="customers-grid">
      <button
        v-if="!requiresExistingCustomer"
        class="customer-card customer-card--anonymous"
        type="button"
        @click="selectAnonymous"
      >
        <span class="customer-card__avatar">AN</span>
        <span class="customer-card__body">
          <strong>Utilisateur anonyme</strong>
          <span>Continuer sans compte client existant</span>
        </span>
      </button>

      <button
        v-for="customer in customers"
        :key="customer.id"
        class="customer-card"
        type="button"
        :disabled="!customer.active"
        @click="selectCustomer(customer)"
      >
        <span class="customer-card__avatar">{{ initials(customer) }}</span>
        <span class="customer-card__body">
          <strong>{{ customer.firstname }} {{ customer.lastname }}</strong>
          <span>{{ maskEmail(customer.email) }}</span>
          <small v-if="!customer.active">Compte inactif</small>
        </span>
      </button>
    </div>


    <div class="customer-select__actions">
      <button class="secondary-btn" type="button" @click="goRegister">
        Nouveau client
      </button>
      <button class="secondary-btn" type="button" @click="goBackOffice">
        BackOffice
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authenticateAnonymousCustomer,
  authenticateCustomer,
  getAllCustomers,
  type CustomerOption,
} from '../services/customer.service'

type LoadingState = 'idle' | 'loading' | 'success' | 'error'

const router = useRouter()
const route = useRoute()
const customers = ref<CustomerOption[]>([])
const loadingState = ref<LoadingState>('idle')
const selectedCustomer = ref<CustomerOption | null>(null)
const verificationEmail = ref('')
const verificationError = ref('')

const requiresExistingCustomer = computed(() =>
  route.query.checkout === '1' || route.query.redirect === '/checkout' || route.query.redirect === '/my-orders'
)

function redirectTarget(): string {
  return typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
}

function initials(customer: CustomerOption): string {
  const first = customer.firstname.charAt(0)
  const last = customer.lastname.charAt(0)
  return `${first}${last}`.toUpperCase() || 'CL'
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!name || !domain) return 'E-mail a verifier'

  const visibleStart = name.slice(0, 2)
  const visibleEnd = name.length > 4 ? name.slice(-1) : ''
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`
}

async function loadCustomers(): Promise<void> {
  loadingState.value = 'loading'

  try {
    customers.value = await getAllCustomers()
    loadingState.value = 'success'
  } catch (error) {
    console.error('Erreur loadCustomers:', error)
    loadingState.value = 'error'
  }
}

function selectCustomer(customer: CustomerOption): void {
  if (!customer.active) return

  authenticateCustomer(customer)
  router.push(redirectTarget())
}



function selectAnonymous(): void {
  authenticateAnonymousCustomer()
  router.push(redirectTarget())
}



function goRegister(): void {
  router.push({ path: '/register', query: { redirect: redirectTarget() } })
}

function goBackOffice(): void {
  router.push('../back/login')
}

onMounted(loadCustomers)
</script>

<style scoped>
.customer-select {
  width: min(1040px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 3rem;
}

.customer-select__header {
  margin-bottom: 1.5rem;
}

.customer-select__eyebrow {
  color: #2563eb;
  font-size: 0.82rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  text-transform: uppercase;
}

.customer-select h1 {
  color: #111827;
  font-size: clamp(1.9rem, 4vw, 3rem);
  line-height: 1.05;
  margin: 0 0 0.5rem;
}

.customer-select p {
  color: #4b5563;
  margin: 0;
}

.customers-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.customer-card {
  align-items: center;
  background: #fff;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  gap: 0.85rem;
  min-height: 96px;
  padding: 1rem;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.customer-card:hover:not(:disabled) {
  border-color: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}

.customer-card--anonymous {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.customer-card:disabled {
  background: #f3f4f6;
  color: #6b7280;
  cursor: not-allowed;
}

.customer-card__avatar {
  align-items: center;
  background: #2563eb;
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  flex: 0 0 48px;
  font-weight: 700;
  height: 48px;
  justify-content: center;
  width: 48px;
}

.customer-card:disabled .customer-card__avatar {
  background: #9ca3af;
}

.customer-card__body {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.customer-card__body strong,
.customer-card__body span {
  overflow-wrap: anywhere;
}

.customer-card__body strong {
  color: #111827;
  font-size: 1rem;
}

.customer-card__body span {
  color: #4b5563;
  font-size: 0.9rem;
}

.customer-card__body small {
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 700;
}

.customer-select__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.email-check {
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  display: grid;
  gap: 0.7rem;
  margin-top: 1rem;
  padding: 1rem;
}

.email-check h2 {
  color: #111827;
  font-size: 1.1rem;
  margin: 0 0 0.25rem;
}

.email-check label {
  color: #374151;
  font-weight: 700;
}

.email-check input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 1rem;
  padding: 0.65rem;
}

.email-check input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
  outline: none;
}

.email-check__error {
  color: #b91c1c;
  font-weight: 700;
}

.email-check__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.email-check__actions button {
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  padding: 0.65rem 0.95rem;
}

.email-check__actions button:first-child {
  background: #2563eb;
  color: #fff;
}

.email-check__actions button:last-child {
  background: #eef2ff;
  color: #1f2937;
}

.secondary-btn,
.state-box button {
  background: #111827;
  border: 0;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  padding: 0.65rem 0.95rem;
}

.secondary-btn {
  background: #eef2ff;
  color: #1f2937;
}

.state-box {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  color: #374151;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  min-height: 96px;
  padding: 1rem;
}

.state-box--error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}
</style>
