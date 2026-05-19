<template>
  <div class="profile-page">
    <div class="profile-header">
      <h1>Mon Profil</h1>
      <button class="btn-back" @click="$router.push('/home')">← Retour</button>
    </div>

    <div v-if="isLoading" class="loading">
      ⏳ Chargement du profil...
    </div>

    <div v-else class="profile-content">
      <div class="profile-card">
        <h2>Informations Personnelles</h2>
        
        <form @submit.prevent="handleSave">
          <div class="form-group">
            <label>Email</label>
            <input v-model="email" disabled readonly type="email" />
            <small>L'email ne peut pas être modifié</small>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Prénom</label>
              <input v-model="firstname" required type="text" />
            </div>
            <div class="form-group">
              <label>Nom</label>
              <input v-model="lastname" required type="text" />
            </div>
          </div>

          <div class="form-group">
            <label>Entreprise</label>
            <input v-model="company" type="text" />
          </div>

          <div class="form-group">
            <label>Adresse</label>
            <input v-model="address1" type="text" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Ville</label>
              <input v-model="city" type="text" />
            </div>
            <div class="form-group">
              <label>Code postal</label>
              <input v-model="postcode" type="text" />
            </div>
          </div>

          <div class="form-group">
            <label>Téléphone</label>
            <input v-model="phone" type="tel" />
          </div>

          <button type="submit" class="btn-save" :disabled="isSaving">
            {{ isSaving ? '💾 Enregistrement...' : '💾 Enregistrer' }}
          </button>
        </form>

        <p v-if="successMessage" class="success">✅ {{ successMessage }}</p>
        <p v-if="errorMessage" class="error">❌ {{ errorMessage }}</p>
      </div>

      <div class="profile-card">
        <h2>Sécurité</h2>
        
        <div class="security-section">
          <h3>Changer le mot de passe</h3>
          
          <form @submit.prevent="handleChangePassword">
            <div class="form-group">
              <label>Mot de passe actuel</label>
              <input v-model="currentPassword" type="password" required />
            </div>

            <div class="form-group">
              <label>Nouveau mot de passe</label>
              <input v-model="newPassword" type="password" required />
            </div>

            <div class="form-group">
              <label>Confirmer le nouveau mot de passe</label>
              <input v-model="confirmPassword" type="password" required />
            </div>

            <button type="submit" class="btn-change-pwd" :disabled="isChangingPassword">
              {{ isChangingPassword ? '⏳ Changement...' : '🔐 Changer' }}
            </button>
          </form>

          <p v-if="passwordSuccessMessage" class="success">✅ {{ passwordSuccessMessage }}</p>
          <p v-if="passwordErrorMessage" class="error">❌ {{ passwordErrorMessage }}</p>
        </div>
      </div>

      <div class="profile-card actions">
        <h2>Actions</h2>
        <button class="btn-orders" @click="$router.push('/orders')">
          📋 Voir mes commandes
        </button>
        <button class="btn-logout" @click="handleLogout">
          🚪 Déconnexion
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getOne, getAllIds, putXML } from '@/shared/services/prestashop.service.js'
import CryptoJS from 'crypto-js'

const router = useRouter()

// Form data
const email = ref('')
const firstname = ref('')
const lastname = ref('')
const company = ref('')
const address1 = ref('')
const city = ref('')
const postcode = ref('')
const phone = ref('')

// Password change
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

// State
const isLoading = ref(true)
const isSaving = ref(false)
const isChangingPassword = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const passwordSuccessMessage = ref('')
const passwordErrorMessage = ref('')
const customerId = ref('')

const isAuthenticated = computed(() =>
  localStorage.getItem('auth_authenticated') === 'true' &&
  localStorage.getItem('auth_email') !== null
)

async function loadProfile() {
  if (!isAuthenticated.value) {
    router.push('/login?redirect=/profile')
    return
  }

  try {
    isLoading.value = true
    const storedEmail = localStorage.getItem('auth_email')
    if (!storedEmail) return

    email.value = storedEmail

    // Trouver le client par email
    const customerIds = await getAllIds('customers')
    for (const id of customerIds) {
      const customer: any = await getOne('customers', id)
      if (customer && customer.email === storedEmail) {
        customerId.value = id
        firstname.value = customer.firstname || ''
        lastname.value = customer.lastname || ''
        company.value = customer.company || ''
        phone.value = customer.phone || ''

        // Charger l'adresse si elle existe
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
        break
      }
    }
  } catch (err) {
    console.error('Erreur chargement profil:', err)
    errorMessage.value = 'Erreur lors du chargement du profil'
  } finally {
    isLoading.value = false
  }
}

async function handleSave() {
  successMessage.value = ''
  errorMessage.value = ''

  if (!firstname.value || !lastname.value) {
    errorMessage.value = 'Le prénom et le nom sont requis'
    return
  }

  try {
    isSaving.value = true

    if (!customerId.value) return

    // Mettre à jour le client
    const customerXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <firstname><![CDATA[${firstname.value}]]></firstname>
    <lastname><![CDATA[${lastname.value}]]></lastname>
    <company><![CDATA[${company.value}]]></company>
    <phone><![CDATA[${phone.value}]]></phone>
  </customer>
</prestashop>`

    await putXML('customers', customerId.value, customerXml)

    successMessage.value = 'Profil mis à jour avec succès !'
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)
  } catch (err) {
    console.error('Erreur sauvegarde:', err)
    errorMessage.value = 'Erreur lors de la sauvegarde'
  } finally {
    isSaving.value = false
  }
}

async function handleChangePassword() {
  passwordSuccessMessage.value = ''
  passwordErrorMessage.value = ''

  if (newPassword.value !== confirmPassword.value) {
    passwordErrorMessage.value = 'Les mots de passe ne correspondent pas'
    return
  }

  if (newPassword.value.length < 6) {
    passwordErrorMessage.value = 'Le mot de passe doit contenir au moins 6 caractères'
    return
  }

  try {
    isChangingPassword.value = true

    // Vérifier l'ancien mot de passe
    if (!customerId.value) return

    const customer: any = await getOne('customers', customerId.value)
    const hashedCurrent = CryptoJS.MD5(currentPassword.value).toString()

    if (
      !customer.passwd ||
      (customer.passwd !== hashedCurrent && customer.passwd !== hashedCurrent.toLowerCase())
    ) {
      passwordErrorMessage.value = 'Le mot de passe actuel est incorrect'
      return
    }

    // Mettre à jour le mot de passe
    const hashedNew = CryptoJS.MD5(newPassword.value).toString()
    const customerXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <passwd><![CDATA[${hashedNew}]]></passwd>
  </customer>
</prestashop>`

    await putXML('customers', customerId.value, customerXml)

    passwordSuccessMessage.value = 'Mot de passe changé avec succès !'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''

    setTimeout(() => {
      passwordSuccessMessage.value = ''
    }, 3000)
  } catch (err) {
    console.error('Erreur changement mot de passe:', err)
    passwordErrorMessage.value = 'Erreur lors du changement de mot de passe'
  } finally {
    isChangingPassword.value = false
  }
}

function handleLogout() {
  localStorage.removeItem('auth_authenticated')
  localStorage.removeItem('auth_email')
  localStorage.removeItem('auth_token')
  router.push('/home')
}

onMounted(() => {
  loadProfile()
})
</script>

<style scoped>
.profile-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 2px solid #eee;
  padding-bottom: 1rem;
}

.profile-header h1 {
  margin: 0;
  color: #333;
}

.btn-back {
  padding: 0.5rem 1rem;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.btn-back:hover {
  background: #e0e0e0;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.profile-content {
  display: grid;
  gap: 2rem;
}

.profile-card {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.profile-card h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #333;
  border-bottom: 2px solid #2a7ae2;
  padding-bottom: 0.5rem;
}

.profile-card h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #555;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #333;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #2a7ae2;
  box-shadow: 0 0 4px rgba(42, 122, 226, 0.2);
}

.form-group input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #999;
  font-size: 0.85rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.security-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #eee;
}

.btn-save,
.btn-change-pwd {
  padding: 0.75rem 1.5rem;
  background: #2a7ae2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  transition: background 0.3s;
}

.btn-save:hover:not(:disabled),
.btn-change-pwd:hover:not(:disabled) {
  background: #1e5ba8;
}

.btn-save:disabled,
.btn-change-pwd:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.profile-card.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.profile-card.actions > :nth-child(n + 2) {
  grid-column: 1 / -1;
}

.btn-orders,
.btn-logout {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  width: 100%;
}

.btn-orders {
  background: #28a745;
  color: white;
}

.btn-orders:hover {
  background: #218838;
}

.btn-logout {
  background: #dc3545;
  color: white;
}

.btn-logout:hover {
  background: #c82333;
}

.success {
  margin-top: 1rem;
  padding: 1rem;
  background: #d4edda;
  color: #155724;
  border-radius: 4px;
  border: 1px solid #c3e6cb;
}

.error {
  margin-top: 1rem;
  padding: 1rem;
  background: #f8d7da;
  color: #721c24;
  border-radius: 4px;
  border: 1px solid #f5c6cb;
}

@media (max-width: 768px) {
  .profile-page {
    padding: 1rem;
  }

  .profile-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .profile-card.actions {
    grid-template-columns: 1fr;
  }

  .profile-card.actions > :nth-child(n + 2) {
    grid-column: 1;
  }
}
</style>
