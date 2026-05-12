<template>
  <div class="landing">
    <div class="landing-container">
      <div class="landing-header">
        <h1> E-Commerce Platform</h1>
        <p>Choisissez votre espace</p>
      </div>

      <div class="landing-buttons">
        <!-- Bouton BackOffice -->
        <button class="landing-btn landing-btn--bo" @click="goToBO">
          <span class="landing-btn__icon"></span>
          <span class="landing-btn__title">BackOffice</span>
          <span class="landing-btn__description">Gestion des produits, commandes et imports</span>
        </button>

        <!-- Bouton FrontOffice -->
        <button class="landing-btn landing-btn--fo" @click="goToFO">
          <span class="landing-btn__icon"></span>
          <span class="landing-btn__title">FrontOffice</span>
          <span class="landing-btn__description">Voir les produits et magasiner</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../BackOffice/stores/auth.store';

const router = useRouter();
const authStore = useAuthStore();

const goToBO = () => {
  // Nettoyer la session avant d'aller au login
  authStore.logout();
  router.push('/back/login');
};

const goToFO = () => {
  router.push('/home');
};
</script>
