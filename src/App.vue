<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './BackOffice/composables/useAuth';
import { computed } from 'vue';
import { useCartStore } from './FrontOffice/stores/cart.store'
import { clearCustomerSession } from './FrontOffice/services/customer.service'

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
const isCustomerAuthenticated = computed(() => {
  route.fullPath;
  return localStorage.getItem('auth_authenticated') === 'true' &&
    localStorage.getItem('auth_email') !== null &&
    localStorage.getItem('auth_token') !== null;
});
const customerName = computed(() => {
  route.fullPath;
  return localStorage.getItem('auth_customer_name') || localStorage.getItem('auth_email') || ''
});

const handleLogout = async () => {
  await logout(); // Ajoutez 'await' si logout est async
  router.push('/back/login');
};

function formatPrice(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const cartCount = computed(() => cart.items.reduce((sum, item) => sum + item.quantity, 0));

function handleCustomerLogout() {
  clearCustomerSession()
  router.push('/')
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
        <button class="nav-button" @click="$router.push('/back/dashboard')">
          Tableau de bord
        </button>
        <button class="nav-button" @click="$router.push('/back/import')">
          📁 Import fichier
        </button>
        <button class="nav-button" @click="$router.push('/back/orders')">
          📦 Commandes
        </button>
        <button class="nav-button" @click="$router.push('/back/stocks')">
          📊 Stocks
        </button>
        <button class="nav-button" @click="$router.push('/back/statistics')">
          Statistiques
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
        <div class="brand"><a href="/">Boutique</a></div>
        <div class="fo-links">
          <button v-if="!isCustomerAuthenticated" class="fo-link" type="button" @click="$router.push('/login')">
            Connexion
          </button>
          <button v-if="!isCustomerAuthenticated" class="fo-link" type="button" @click="$router.push('/register')">
            Inscription
          </button>
          <span v-if="isCustomerAuthenticated" class="customer-pill">{{ customerName }}</span>
          <button v-if="isCustomerAuthenticated" class="fo-link" type="button" @click="$router.push('/my-orders')">
            Mes commandes
          </button>
          <button v-if="isCustomerAuthenticated" class="fo-link" type="button" @click="handleCustomerLogout">
            Deconnexion
          </button>
          <button class="cart-mini" type="button" @click="$router.push('/cart')">
            <span>Panier</span>
            <span class="count">{{ cartCount }}</span>
          </button>
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
.fo-links { display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap }
.fo-link { cursor:pointer; border:0; background:transparent; color:#1f2937 }
.customer-pill { color:#374151; font-size:0.9rem; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.cart-mini { cursor:pointer; display:flex; gap:0.5rem; align-items:center; border:0; background:transparent; color:#1f2937 }
.cart-mini .count{ background:#2a7ae2; color:#fff; padding:0.1rem 0.5rem; border-radius:10px }
.btn-checkout{ margin-left:0.5rem; background:#2a7ae2; color:#fff; border:none; padding:0.25rem 0.5rem }
</style>
