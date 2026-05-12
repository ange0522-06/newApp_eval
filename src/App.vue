<script setup>
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './BackOffice/composables/useAuth';
import { computed } from 'vue';

const router = useRouter();
const route = useRoute();
const { logout, isAuthenticated } = useAuth();

// ✅ Vérifier si on est sur une page de login
const isLoginPage = computed(() => route.path === '/back/login');

// ✅ Détecter les pages BackOffice
const isBackOfficePage = computed(() => route.path.startsWith('/back'));

// ✅ Afficher la navigation seulement si authentifié ET dans le BackOffice
const showNavbar = computed(() => isAuthenticated.value && isBackOfficePage.value && !isLoginPage.value);

const handleLogout = async () => {
  await logout(); // Ajoutez 'await' si logout est async
  router.push('/back/login');
};
</script>

<template>
  <div class="app-container">
    <!-- Navigation (only show when authenticated AND not on login page) -->
    <nav class="navbar" v-if="showNavbar">
      <div class="nav-brand">
        <h1><a href="/">PrestaShop</a></h1>
        <br>
        <h4> Admin</h4>
      </div>
      <div class="nav-links">
        <button class="nav-button" @click="$router.push('/back/import')">
          📁 Import fichier
        </button>
        <button class="nav-button" @click="$router.push('/back/orders')">
          📦 Commandes
        </button>
        <button class="nav-button" @click="$router.push('/back/reset')">
          🔄 Réinitialiser
        </button>
        <button class="nav-button logout-btn" @click="handleLogout">
          🚪 Déconnexion
        </button>
      </div>
    </nav>

    <!-- Router View Outlet -->
    <main class="page-content">
      <router-view />
    </main>
  </div>
</template>