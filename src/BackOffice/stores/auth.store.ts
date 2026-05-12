// BackOffice/stores/auth.store.ts
import { defineStore } from 'pinia';
import { authService} from '../services/auth.service';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    userEmail: localStorage.getItem('auth_email') || null,
    authToken: localStorage.getItem('auth_token') || null,
    isLoading: false,
    errorMessage: '',
  }),

  getters: {
    // ✅ Vérification correcte de l'authentification
    isAuthenticated: (state) => {
      const hasAuth = state.authToken !== null && state.userEmail !== null;
      const storageFlag = localStorage.getItem('auth_authenticated') === 'true';
      return hasAuth && storageFlag;
    },
  },

  actions: {
    async login(email: string, password: string): Promise<boolean> {
      this.isLoading = true;
      this.errorMessage = '';

      try {
        // Appel à votre auth service
        const response = await authService.login(email, password);
        
        if (response.success && response.token && response.email) {
          this.userEmail = response.email;
          this.authToken = response.token;
          localStorage.setItem('auth_authenticated', 'true');
          localStorage.setItem('auth_email', response.email);
          localStorage.setItem('auth_token', response.token);
          return true;
        } else {
          this.errorMessage = response.message || 'Échec de connexion';
          return false;
        }
      } catch (error) {
        this.errorMessage = 'Erreur réseau';
        return false;
      } finally {
        this.isLoading = false;
      }
    },

    logout(): void {
      this.userEmail = null;
      this.authToken = null;
      this.errorMessage = '';
      localStorage.removeItem('auth_authenticated');
      localStorage.removeItem('auth_email');
      localStorage.removeItem('auth_token');
    },

    clearError(): void {
      this.errorMessage = '';
    },
  },
});