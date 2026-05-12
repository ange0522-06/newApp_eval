import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../BackOffice/stores/auth.store';

// Back-Office Views
import LoginView from '../BackOffice/views/LoginView.vue';
import ImportView from '../BackOffice/views/ImportView.vue';
import OrdersView from '../BackOffice/views/OrdersView.vue';
import ResetView from '../BackOffice/views/ResetView.vue';

// Front-Office Views
import HomeView from '../FrontOffice/views/HomeView.vue';
import ProductView from '../FrontOffice/views/ProductView.vue';

// Shared Views
import LandingView from '../shared/views/LandingView.vue';

// Typage pour les métadonnées des routes
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
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

  // ==================== Front-Office ====================
  {
    path: '/home',
    name: 'Home',
    component: HomeView,
    meta: { requiresAuth: false },
  },
  {
    path: '/product/:id',
    name: 'Product',
    component: ProductView,
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
    path: '/back/reset',
    name: 'BackReset',
    component: ResetView,
    meta: { requiresAuth: true },
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
  const isAuthenticated = authStore.isAuthenticated;
  const requiresAuth = to.meta.requiresAuth !== false; // Par défaut, toute route nécessite l'auth

  console.log(`Navigation vers ${to.path}`, {
    isAuthenticated,
    requiresAuth,
    meta: to.meta,
  });

  // Si la route nécessite authentification et l'utilisateur n'est pas auth
  if (requiresAuth && !isAuthenticated) {
    console.log(`❌ Route ${to.path} nécessite auth, redirection vers login`);
    return {
      path: '/back/login',
      query: { redirect: to.fullPath },
    };
  }
  // Si l'utilisateur est auth et essaie d'accéder au login
  else if (to.path === '/back/login' && isAuthenticated) {
    console.log(`✓ User déjà auth, redirection vers import`);
    return '/back/import';
  }
  // Sinon, continuer normalement
  else {
    return true;
  }
});

export default router;