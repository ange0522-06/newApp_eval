<script setup>
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './BackOffice/composables/useAuth';

const router = useRouter();
const route = useRoute();
const { logout, isAuthenticated } = useAuth();

const handleLogout = async () => {
  logout();
  router.push('/back/login');
};
</script>

<template>
  <div class="app-container">
    <!-- Navigation (only show if authenticated) -->
    <nav class="navbar" v-if="isAuthenticated && !route.path.includes('/back/login')">
      <div class="nav-brand">
        <h1>🛠️ PrestaShop Admin</h1>
      </div>
      <div class="nav-links">
        <button class="nav-button" @click="$router.push('/back/import')">
          📁 Import fichier
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


