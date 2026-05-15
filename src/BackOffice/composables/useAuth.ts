import { useAuthStore } from '../stores/auth.store';
import { computed } from 'vue';

/**
 * Composable pour accéder aux fonctionnalités d'authentification
 */
export function useAuth() {
  const authStore = useAuthStore();

  const isAuthenticated = computed(() => authStore.isAuthenticated);
  const email = computed(() => authStore.userEmail);
  const errorMessage = computed(() => authStore.errorMessage);
  const isLoading = computed(() => authStore.isLoading);

  const login = (emailInput: string, passwordInput: string) => {
    return authStore.login(emailInput, passwordInput);
  };

  const logout = () => {
    authStore.logout();
  };

  const clearError = () => {
    authStore.clearError();
  };

  return {
    isAuthenticated,
    email,
    errorMessage,
    isLoading,
    login,
    logout,
    clearError,
  };
}
