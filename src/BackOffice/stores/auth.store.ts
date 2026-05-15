// BackOffice/stores/auth.store.ts
import { defineStore } from 'pinia';
import { authService} from '../services/auth.service';
import { STORAGE_KEYS } from '../config/config';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    userEmail: localStorage.getItem(STORAGE_KEYS.EMAIL) || null,
    authToken: localStorage.getItem(STORAGE_KEYS.TOKEN) || null,
    isLoading: false,
    errorMessage: '',
  }),

  getters: {
    // ✅ Vérification correcte de l'authentification
    isAuthenticated: (state) => {
      const hasAuth = state.authToken !== null && state.userEmail !== null;
      const storageFlag = localStorage.getItem(STORAGE_KEYS.AUTH) === 'true';
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
          localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
          localStorage.setItem(STORAGE_KEYS.EMAIL, response.email);
          localStorage.setItem(STORAGE_KEYS.TOKEN, response.token);
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
      localStorage.removeItem(STORAGE_KEYS.AUTH);
      localStorage.removeItem(STORAGE_KEYS.EMAIL);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    },

    clearError(): void {
      this.errorMessage = '';
    },
  },
});
