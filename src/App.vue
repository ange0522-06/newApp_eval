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
        <div class="brand"><a href="/">🛍️ Boutique</a></div>
        <div class="fo-links">
          <button v-if="!isCustomerAuthenticated" class="fo-link" type="button" @click="$router.push('/login')">
            🔐 Connexion
          </button>
          <button v-if="!isCustomerAuthenticated" class="fo-link" type="button" @click="$router.push('/register')">
            ✍️ Inscription
          </button>
          
          <!-- Menu client connecté -->
          <div v-if="isCustomerAuthenticated" class="customer-menu">
            <span class="customer-pill">👤 {{ customerName }}</span>
            <button class="fo-link" type="button" @click="$router.push('/profile')">
              ⚙️ Mon Profil
            </button>
            <button class="fo-link" type="button" @click="$router.push('/orders')">
              📋 Mes Commandes
            </button>
            <button class="fo-link logout-link" type="button" @click="handleCustomerLogout">
              🚪 Déconnexion
            </button>
          </div>

          <!-- Panier -->
          <button class="cart-mini" type="button" @click="$router.push('/cart')">
            <span>🛒</span>
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
.fo-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 0.75rem 1.5rem; 
  background: linear-gradient(135deg, #f7f7f7 0%, #fafafa 100%);
  border-bottom: 2px solid #e5e5e5;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.brand {
  font-size: 1.3rem;
  font-weight: bold;
}

.brand a {
  color: #333;
  text-decoration: none;
}

.brand a:hover {
  color: #2a7ae2;
}

.fo-links { 
  display: flex; 
  gap: 1rem; 
  align-items: center; 
  flex-wrap: wrap;
}

.fo-link { 
  cursor: pointer; 
  border: 0; 
  background: transparent; 
  color: #374151;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  transition: all 0.3s;
  font-weight: 500;
}

.fo-link:hover {
  background: #e5e7eb;
  color: #2a7ae2;
}

.logout-link {
  color: #dc3545;
}

.logout-link:hover {
  background: #f8d7da;
  color: #c82333;
}

.customer-menu {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.customer-pill { 
  color: #374151; 
  font-size: 0.95rem;
  font-weight: bold;
  padding: 0.5rem 0.75rem;
  background: #e5e7eb;
  border-radius: 20px;
  max-width: 220px; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap;
}

.cart-mini { 
  cursor: pointer; 
  display: flex; 
  gap: 0.5rem; 
  align-items: center; 
  border: 2px solid #2a7ae2;
  background: white;
  color: #2a7ae2;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-weight: bold;
  transition: all 0.3s;
}

.cart-mini:hover {
  background: #2a7ae2;
  color: white;
}

.cart-mini .count { 
  background: #ff6b6b; 
  color: #fff; 
  padding: 0.2rem 0.5rem; 
  border-radius: 10px;
  font-size: 0.85rem;
}
</style>
