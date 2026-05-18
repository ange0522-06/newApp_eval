<template>
  <div class="cust-auth">
    <h2>Inscription client</h2>
    <form @submit.prevent="handleRegister">
      <div class="field">
        <label>Prenom</label>
        <input v-model.trim="firstname" required />
      </div>
      <div class="field">
        <label>Nom</label>
        <input v-model.trim="lastname" required />
      </div>
      <div class="field">
        <label>Email</label>
        <input v-model.trim="email" type="email" required />
      </div>
      <div class="field">
        <label>Mot de passe</label>
        <input v-model="password" type="password" required />
      </div>
      <div class="actions">
        <button :disabled="isLoading">{{ isLoading ? 'Creation...' : "S'inscrire" }}</button>
        <button type="button" @click="goLogin">Retour connexion</button>
      </div>
    </form>
    <div v-if="message" class="message">{{ message }}</div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CryptoJS from 'crypto-js'
import { postXML } from '@/shared/services/prestashop.service.js'

const ID_SHOP = 1
const ID_SHOP_GROUP = 1
const ID_LANG = 1
const DEFAULT_CUSTOMER_GROUP = 3

const router = useRouter()
const route = useRoute()

const firstname = ref('')
const lastname = ref('')
const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')
const message = ref('')

const redirectTarget = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/checkout'
)

function cdata(value: string | number): string {
  return `<![CDATA[${String(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

function nowForPrestaShop(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function validateRequiredFields(): boolean {
  if (!firstname.value || !lastname.value || !email.value || !password.value) {
    error.value = 'Prenom, nom, email et mot de passe sont requis.'
    return false
  }
  return true
}

function authenticateCustomer(customerEmail: string) {
  localStorage.setItem('auth_authenticated', 'true')
  localStorage.setItem('auth_email', customerEmail)
  localStorage.setItem('auth_token', String(Date.now()))
}

function goLogin() {
  router.push({ path: '/login', query: { redirect: redirectTarget.value } })
}

async function handleRegister() {
  error.value = ''
  message.value = ''
  if (!validateRequiredFields()) return

  isLoading.value = true
  try {
    const hashedPassword = CryptoJS.MD5(password.value).toString()
    const now = nowForPrestaShop()
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <id_default_group>${DEFAULT_CUSTOMER_GROUP}</id_default_group>
    <id_lang>${ID_LANG}</id_lang>
    <passwd>${cdata(hashedPassword)}</passwd>
    <lastname>${cdata(lastname.value)}</lastname>
    <firstname>${cdata(firstname.value)}</firstname>
    <email>${cdata(email.value)}</email>
    <active>1</active>
    <is_guest>0</is_guest>
    <id_shop>${ID_SHOP}</id_shop>
    <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
    <date_add>${now}</date_add>
    <date_upd>${now}</date_upd>
    <associations>
      <groups>
        <group><id>${DEFAULT_CUSTOMER_GROUP}</id></group>
      </groups>
    </associations>
  </customer>
</prestashop>`

    const res = await postXML('customers', xml)
    if (res.success) {
      authenticateCustomer(email.value)
      router.push(redirectTarget.value)
      return
    }

    error.value = res.error || 'Echec creation client.'
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

.message {
  color: #1e8449;
  margin-top: 1rem;
}
</style>
