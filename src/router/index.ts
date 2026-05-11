import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../BackOffice/stores/auth.store';

// Back-Office Views
import LoginView from '../BackOffice/views/LoginView.vue';
import ImportView from '../BackOffice/views/ImportView.vue';
import ResetView from '../BackOffice/views/ResetView.vue';

const routes = [
  // ==================== Back-Office ====================

  // Public routes
  {
    path: '/back/login',
    name: 'BackLogin',
    component: LoginView,
    meta: { requiresAuth: false },
  },

  // Protected routes (nécessitent authentification)
  {
    path: '/back/import',
    name: 'BackImport',
    component: ImportView,
    meta: { requiresAuth: true },
  },
  {
    path: '/back/reset',
    name: 'BackReset',
    component: ResetView,
    meta: { requiresAuth: true },
  },

  // Redirect back to login by default
  {
    path: '/back',
    redirect: '/back/import',
  },

  // ==================== Front-Office ====================
  // À implémenter: FrontOffice/views/ShopView.vue
  // {
  //   path: '/shop',
  //   name: 'Shop',
  //   component: ShopView,
  // },

  // Catch-all - redirige vers back office par défaut
  {
    path: '/:pathMatch(.*)*',
    redirect: '/back/login',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * Guard de navigation pour protéger les routes
 */
router.beforeEach((to, from) => {
  const authStore = useAuthStore();
  const isAuthenticated = authStore.isAuthenticated;
  const requiresAuth = to.meta.requiresAuth;

  // Si la route nécessite authentification et l'utilisateur n'est pas auth
  if (requiresAuth && !isAuthenticated) {
    // Redirection vers login
    return {
      path: '/back/login',
      query: { redirect: to.fullPath },
    };
  }
  // Si l'utilisateur est auth et essaie d'accéder au login
  else if (to.path === '/back/login' && isAuthenticated) {
    // Redirection vers import
    return '/back/import';
  }
  // Sinon, continuer normalement
});

export default router;
