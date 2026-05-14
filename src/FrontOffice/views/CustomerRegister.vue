<template>
  <div class="cust-auth">
    <h2>Inscription client</h2>
    <form @submit.prevent="handleRegister">
      <div>
        <label>Prénom</label>
        <input v-model="firstname" required />
      </div>
      <div>
        <label>Nom</label>
        <input v-model="lastname" required />
      </div>
      <div>
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>
      <div>
        <label>Mot de passe</label>
        <input v-model="password" type="password" required />
      </div>
      <div>
        <button :disabled="isLoading">S'inscrire</button>
        <button type="button" @click="$router.push('/login')">Retour connexion</button>
      </div>
    </form>
    <div v-if="message" class="message">{{ message }}</div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CryptoJS from 'crypto-js'
import { postXML } from '@/shared/services/prestashop.service.js'

const firstname = ref('')
const lastname = ref('')
const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')
const message = ref('')

async function handleRegister() {
  error.value = ''
  message.value = ''
  isLoading.value = true
  try {
    const hashed = CryptoJS.MD5(password.value).toString()
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop>\n  <customer>\n    <email><![CDATA[${email.value}]]></email>\n    <passwd><![CDATA[${hashed}]]></passwd>\n    <firstname><![CDATA[${firstname.value}]]></firstname>\n    <lastname><![CDATA[${lastname.value}]]></lastname>\n    <active>1</active>\n  </customer>\n</prestashop>`

    const res: any = await postXML('customers', xml)
    if (res && (res.success || res.id)) {
      // auto-login
      localStorage.setItem('auth_authenticated', 'true')
      localStorage.setItem('auth_email', email.value)
      localStorage.setItem('auth_token', String(Date.now()))
      window.location.href = '/checkout'
      return
    }

    error.value = 'Échec création client'
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
.message { color: green }
</style>
