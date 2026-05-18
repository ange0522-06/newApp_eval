<template>
  <div class="cust-auth">
    <h2>Connexion client</h2>
    <form @submit.prevent="handleLogin">
      <div class="field">
        <label>Email</label>
        <input v-model.trim="email" type="email" required />
      </div>
      <div class="field">
        <label>Mot de passe</label>
        <input v-model="password" type="password" required />
      </div>
      <div class="actions">
        <button :disabled="isLoading">{{ isLoading ? 'Connexion...' : 'Se connecter' }}</button>
        <button type="button" @click="goRegister">S'inscrire</button>
      </div>
    </form>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CryptoJS from 'crypto-js'
import { getAllIds, getOne } from '@/shared/services/prestashop.service.js'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')

const redirectTarget = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/checkout'
)

function isPasswordValid(storedPassword: string, plainPassword: string): boolean {
  const hashed = CryptoJS.MD5(plainPassword).toString()
  return storedPassword === plainPassword ||
    storedPassword === hashed ||
    storedPassword === hashed.toLowerCase()
}

function authenticateCustomer(customerEmail: string) {
  localStorage.setItem('auth_authenticated', 'true')
  localStorage.setItem('auth_email', customerEmail)
  localStorage.setItem('auth_token', String(Date.now()))
}

function goRegister() {
  router.push({ path: '/register', query: { redirect: redirectTarget.value } })
}

async function handleLogin() {
  error.value = ''
  if (!email.value || !password.value) {
    error.value = 'Email et mot de passe sont requis.'
    return
  }

  isLoading.value = true
  try {
    const ids = await getAllIds('customers')
    for (const id of ids) {
      try {
        const customer = (await getOne('customers', id)) as any
        if (customer && customer.email === email.value) {
          if (customer.passwd && isPasswordValid(customer.passwd, password.value)) {
            authenticateCustomer(email.value)
            router.push(redirectTarget.value)
            return
          }

          error.value = 'Mot de passe incorrect.'
          return
        }
      } catch {
        continue
      }
    }

    error.value = "Client introuvable. Vous pouvez creer un compte."
  } catch {
    error.value = 'Erreur reseau.'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.cust-auth {
  max-width: 480px;
  margin: 1rem auto;
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

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.actions button {
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  padding: 0.6rem 1rem;
}

.actions button:first-child {
  background: #2a7ae2;
  color: #fff;
}

.error {
  color: #c0392b;
  margin-top: 1rem;
}
</style>
