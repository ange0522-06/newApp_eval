<template>
  <div class="cust-auth">
    <h2>Connexion client</h2>
    <form @submit.prevent="handleLogin">
      <div>
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>
      <div>
        <label>Mot de passe (optionnel)</label>
        <input v-model="password" type="password" />
      </div>
      <div>
        <button :disabled="isLoading">Se connecter</button>
        <button type="button" @click="$router.push('/register')">S'inscrire</button>
      </div>
    </form>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CryptoJS from 'crypto-js'
import { getAllIds, getOne } from '@/shared/services/prestashop.service.js'

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')

async function handleLogin() {
  error.value = ''
  if (!password.value) {
    error.value = 'Le mot de passe est requis.'
    return
  }
  isLoading.value = true
  try {
    const ids = await getAllIds('customers')
    for (const id of ids) {
      try {
        const customer: any = await getOne('customers', id)
        if (customer && customer.email === email.value) {
          const hashed = CryptoJS.MD5(password.value).toString()
          // PrestaShop stores MD5 hashed password in customer.passwd
          if (customer.passwd && (customer.passwd === hashed || customer.passwd === hashed.toLowerCase())) {
            localStorage.setItem('auth_authenticated', 'true')
            localStorage.setItem('auth_email', email.value)
            localStorage.setItem('auth_token', String(Date.now()))
            const redirect = (new URLSearchParams(window.location.search)).get('redirect') || '/checkout'
            window.location.href = redirect
            return
          } else {
            error.value = 'Mot de passe incorrect.'
            return
          }
        }
      } catch {}
    }
    error.value = "Client introuvable. Utilisez S'inscrire pour créer un compte."
  } catch (e) {
    error.value = 'Erreur réseau'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.cust-auth { max-width: 480px; margin: 1rem auto }
.error { color: red }
</style>
