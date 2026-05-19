import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../BackOffice/stores/auth.store';

// Back-Office Views
import LoginView from '../BackOffice/views/LoginView.vue';
import ImportView from '../BackOffice/views/ImportView.vue';
import OrdersView from '../BackOffice/views/OrdersView.vue';
import ResetView from '../BackOffice/views/ResetView.vue';
import DashboardView from '../BackOffice/views/DashboardView.vue';
import StocksView from '../BackOffice/views/StocksView.vue';
import StatisticsView from '../BackOffice/views/StatisticsView.vue';

// Front-Office Views
import HomeView from '../FrontOffice/views/HomeView.vue';
import ProductView from '../FrontOffice/views/ProductView.vue';
import CartView from '../FrontOffice/views/CartView.vue';
import CheckoutView from '../FrontOffice/views/CheckoutView.vue';
import CustomerLogin from '../FrontOffice/views/CustomerLogin.vue';
import CustomerRegister from '../FrontOffice/views/CustomerRegister.vue';
import CustomerSelectView from '../FrontOffice/views/CustomerSelectView.vue';
import CustomerOrdersView from '../FrontOffice/views/CustomerOrdersView.vue';
import CustomerProfileView from '../FrontOffice/views/CustomerProfileView.vue';

// Shared Views
import LandingView from '../shared/views/LandingView.vue';

// Typage pour les métadonnées des routes
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresExistingCustomer?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  // ==================== Landing Page ====================
  {
    path: '/',
    name: 'Landing',
    component: LandingView,
    meta: { requiresAuth: false },
  },
  {
    path: '/landing',
    component: LandingView,
    meta: { requiresAuth: false },
  },

  // ==================== Front-Office entry ====================
  {
    path: '/front/customers',
    name: 'CustomerSelect',
    component: CustomerSelectView,
    meta: { requiresAuth: false },
  },

  // ==================== Front-Office ====================
  {
    path: '/home',
    name: 'Home',
    component: HomeView,
    meta: { requiresAuth: true },
  },
  {
    path: '/product/:id',
    name: 'Product',
    component: ProductView,
    meta: { requiresAuth: true },
  },

  {
    path: '/cart',
    name: 'Cart',
    component: CartView,
    meta: { requiresAuth: true },
  },

  {
    path: '/checkout',
    name: 'Checkout',
    component: CheckoutView,
    meta: { requiresAuth: true },
  },

  {
    path: '/orders',
    name: 'Orders',
    component: CustomerOrdersView,
    meta: { requiresAuth: true },
  },

  {
    path: '/profile',
    name: 'Profile',
    component: CustomerProfileView,
    meta: { requiresAuth: true },
  },

  {
    path: '/my-orders',
    name: 'MyOrders',
    component: CustomerOrdersView,
    meta: { requiresAuth: true },
  },

  // Front-office customer auth
  {
    path: '/login',
    name: 'CustomerLogin',
    component: CustomerLogin,
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'CustomerRegister',
    component: CustomerRegister,
    meta: { requiresAuth: false },
  },

  // ==================== Back-Office ====================

  // Public routes (pas d'authentification requise)
  {
    path: '/back/login',
    name: 'BackLogin',
    component: LoginView,
    meta: { requiresAuth: false },
  },

  // Routes protégées (authentification requise)
  {
    path: '/back/dashboard',
    name: 'BackDashboard',
    component: DashboardView,
    meta: { requiresAuth: true },
  },

  {
    path: '/back/import',
    name: 'BackImport',
    component: ImportView,
    meta: { requiresAuth: true },
  },

  {
    path: '/back/orders',
    name: 'BackOrders',
    component: OrdersView,
    meta: { requiresAuth: true },
  },

  {
    path: '/back/stocks',
    name: 'BackStocks',
    component: StocksView,
    meta: { requiresAuth: true },
  },

  {
    path: '/back/statistics',
    name: 'BackStatistics',
    component: StatisticsView,
    meta: { requiresAuth: true },
  },

  {
    path: '/back/reset',
    name: 'BackReset',
    component: ResetView,
    meta: { requiresAuth: true },
  },

  // Toute URL /back inconnue doit revenir au login BO
  {
    path: '/back/:pathMatch(.*)*',
    redirect: '/back/login',
  },

  // Catch-all - redirige vers back office par défaut
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * Guard de navigation pour protéger les routes
 * Règles :
 * - Si route nécessite auth et user n'est pas auth → rediriger vers login
 * - Si user est auth et essaie d'accéder au login → rediriger vers import
 * - Sinon, continuer normalement
 */
// ✅ CORRECTION : Suppression du paramètre "next"
router.beforeEach((to, from) => {
  const authStore = useAuthStore();
  const isBackOfficeRoute = to.path.startsWith('/back');
  const isBackOfficeAuthenticated = authStore.isAuthenticated;
  const isCustomerAuthenticated =
    localStorage.getItem('auth_authenticated') === 'true' &&
    localStorage.getItem('auth_email') !== null &&
    localStorage.getItem('auth_token') !== null;
  const isAnonymousCustomer = localStorage.getItem('auth_is_anonymous') === 'true';
  const isAuthenticated = isBackOfficeRoute ? isBackOfficeAuthenticated : isCustomerAuthenticated;
  const requiresAuth = to.meta.requiresAuth !== false; // Par défaut, toute route nécessite l'auth

  console.log(`Navigation vers ${to.path}`, {
    isAuthenticated,
    isBackOfficeAuthenticated,
    isCustomerAuthenticated,
    requiresAuth,
    meta: to.meta,
  });

  // Si la route nécessite authentification et l'utilisateur n'est pas auth
  if (requiresAuth && !isAuthenticated) {
    console.log(`❌ Route ${to.path} nécessite auth, redirection vers login`);
    // Si la route demandée est dans le BackOffice, rediriger vers /back/login
    if (isBackOfficeRoute) {
      return { path: '/back/login', query: { redirect: to.fullPath } }
    }
    // Sinon, rediriger vers le login front-office
    return { path: '/', query: { redirect: to.fullPath } }
  }
  // Si l'utilisateur est auth et essaie d'accéder au login
  else if (!isBackOfficeRoute && to.meta.requiresExistingCustomer && isAnonymousCustomer) {
    return { path: '/front/customers', query: { redirect: to.fullPath, checkout: '1' } }
  }
  else if (to.path === '/back/login' && isBackOfficeAuthenticated) {
    console.log(`✓ User déjà auth, redirection vers import`);
    return '/back/import';
  } else if ((to.path === '/login' || to.path === '/register') && isCustomerAuthenticated) {
    console.log(`✓ Client déjà connecté, redirection vers home`);
    return typeof to.query.redirect === 'string' ? to.query.redirect : '/home';
  }
  // Sinon, continuer normalement
  else {
    return true;
  }
});

export default router;
