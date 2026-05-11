<template>
  <div class="login-container">
    <div class="login-box">
      <h1>🔐 Back-Office PrestaShop</h1>
      <p class="subtitle">Connectez-vous avec vos identifiants administrateur</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <!-- Email -->
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="admin@prestashop.com"
            required
            :disabled="isLoading"
            class="form-input"
          />
        </div>

        <!-- Mot de passe -->
        <div class="form-group">
          <label for="password">Mot de passe</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            required
            :disabled="isLoading"
            class="form-input"
          />
        </div>

        <!-- Message d'erreur -->
        <div v-if="errorMessage" class="error-message">
          ❌ {{ errorMessage }}
        </div>

        <!-- Bouton de connexion -->
        <button
          type="submit"
          :disabled="isLoading"
          class="btn-login"
        >
          <span v-if="!isLoading">Se connecter</span>
          <span v-else>Connexion en cours...</span>
        </button>
      </form>

      <div class="info-text">
        <p>Utilisez les identifiants de l'administrateur PrestaShop</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const { login, errorMessage, isLoading, clearError } = useAuth();

// Valeurs par défaut pré-remplies
const email = ref<string>('admin@prestashop.com');
const password = ref<string>('prestashop');

async function handleLogin() {
  clearError();

  if (!email.value || !password.value) {
    return;
  }

  const success = await login(email.value, password.value);

  if (success) {
    // Redirection vers la page d'import après connexion réussie
    router.push('/back/import');
  }
}
</script>


