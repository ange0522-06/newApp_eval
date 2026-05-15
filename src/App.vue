<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './BackOffice/composables/useAuth';
import { computed } from 'vue';
import { useCartStore } from './FrontOffice/stores/cart.store'

const cart = useCartStore()

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

function formatPrice(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
</script>

<template>
  <div class="app-container">
    <!-- BackOffice Navigation (only show when authenticated AND not on login page) -->
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

      <!-- FrontOffice header with mini-cart (visible when not in backoffice) -->
      <header class="fo-header" v-if="!isBackOfficePage">
        <div class="brand"><a href="/home">Boutique</a></div>
        <div class="fo-actions">
          <div class="cart-mini" @click="$router.push('/checkout')">
            🛒 <span class="count">{{ cart.items.length }}</span>
            <span class="total">{{ formatPrice(cart.items.reduce((s,i) => s + i.price * i.quantity, 0)) }}</span>
            <button class="btn-checkout" @click.stop="$router.push('/checkout')">Commander</button>
          </div>
        </div>
      </header>

    <!-- Router View Outlet -->
    <main class="page-content">
      <router-view />
    </main>
  </div>
</template>

 

<style scoped>
.fo-header { display:flex; justify-content:space-between; align-items:center; padding:0.5rem 1rem; background:#f7f7f7 }
.cart-mini { cursor:pointer; display:flex; gap:0.5rem; align-items:center }
.cart-mini .count{ background:#2a7ae2; color:#fff; padding:0.1rem 0.5rem; border-radius:10px }
.btn-checkout{ margin-left:0.5rem; background:#2a7ae2; color:#fff; border:none; padding:0.25rem 0.5rem }
</style>