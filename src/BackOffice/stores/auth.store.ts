import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authService } from '../services/auth.service';

export const useAuthStore = defineStore('auth', () => {
  // State
  const isAuth = ref<boolean>(authService.isAuthenticated());
  const email = ref<string | null>(authService.getEmail());
  const token = ref<string | null>(authService.getToken());
  const errorMessage = ref<string>('');
  const isLoading = ref<boolean>(false);

  // Computed
  const isAuthenticated = computed(() => isAuth.value);
  const userEmail = computed(() => email.value);

  // Actions
  async function login(emailInput: string, passwordInput: string): Promise<boolean> {
    errorMessage.value = '';
    isLoading.value = true;

    try {
      const result = await authService.login(emailInput, passwordInput);

      if (result.success && result.token && result.email) {
        isAuth.value = true;
        email.value = result.email;
        token.value = result.token;
        return true;
      } else {
        errorMessage.value = result.message || 'Erreur lors de la connexion';
        isAuth.value = false;
        email.value = null;
        token.value = null;
        return false;
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Erreur inconnue';
      isAuth.value = false;
      email.value = null;
      token.value = null;
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function logout(): void {
    authService.logout();
    isAuth.value = false;
    email.value = null;
    token.value = null;
    errorMessage.value = '';
  }

  function clearError(): void {
    errorMessage.value = '';
  }

  return {
    // State
    isAuth,
    email,
    token,
    errorMessage,
    isLoading,

    // Computed
    isAuthenticated,
    userEmail,

    // Actions
    login,
    logout,
    clearError,
  };
});
