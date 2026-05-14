import CryptoJS from 'crypto-js';
import { API_CONFIG, STORAGE_KEYS, ERROR_MESSAGES } from '../config/config';

interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  email?: string;
}

/**
 * Service d'authentification back-office.
 * Le mot de passe employe est verifie cote PHP avec le systeme de hash PrestaShop.
 */
class AuthService {
  /**
   * Authentifie l'utilisateur via la table employee PrestaShop.
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      if (!email || !password) {
        return { success: false, message: ERROR_MESSAGES.MISSING_CREDENTIALS };
      }

      const response = await fetch(API_CONFIG.BO_LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success && data?.employee?.email) {
        const employeeEmail = String(data.employee.email);
        const token = CryptoJS.SHA256(`${employeeEmail}:${Date.now()}:${Math.random()}`).toString();
        this.storeCredentials(employeeEmail, token);
        return { success: true, token, email: employeeEmail };
      }

      if (response.status === 401) {
        return { success: false, message: data?.message || ERROR_MESSAGES.INVALID_CREDENTIALS };
      }

      return {
        success: false,
        message: data?.message || `${ERROR_MESSAGES.SERVER_ERROR}: ${response.status}`,
      };
    } catch (error) {
      console.error('Auth error:', error);
      return {
        success: false,
        message: ERROR_MESSAGES.NETWORK_ERROR,
      };
    }
  }

  /**
   * Stocke les credentials dans localStorage
   */
  private storeCredentials(email: string, token: string): void {
    localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
    localStorage.setItem(STORAGE_KEYS.EMAIL, email);
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  }

  /**
   * Déconnecte l'utilisateur
   */
  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem(STORAGE_KEYS.EMAIL);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
  }

  /**
   * Vérifie si l'utilisateur est authentifié
   */
  isAuthenticated(): boolean {
    return localStorage.getItem(STORAGE_KEYS.AUTH) === 'true';
  }

  /**
   * Retourne l'email de l'utilisateur connecté
   */
  getEmail(): string | null {
    return localStorage.getItem(STORAGE_KEYS.EMAIL);
  }

  /**
   * Retourne le token de la session
   */
  getToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  }

  /**
   * Retourne les credentials stockés
   */
  getCredentials(): { email: string | null; token: string | null } {
    return {
      email: this.getEmail(),
      token: this.getToken(),
    };
  }
}

export const authService = new AuthService();
