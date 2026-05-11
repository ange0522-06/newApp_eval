import CryptoJS from 'crypto-js';
import { API_CONFIG, STORAGE_KEYS, ERROR_MESSAGES } from '../config/config';

interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  email?: string;
}

/**
 * Service d'authentification via WebService PrestaShop
 * Utilise l'API avec authentification Basic (MD5)
 */
class AuthService {
  /**
   * Hash le password en MD5
   */
  private hashPassword(password: string): string {
    return CryptoJS.MD5(password).toString();
  }

  /**
   * Authentifie l'utilisateur via PrestaShop WebService
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      if (!email || !password) {
        return { success: false, message: ERROR_MESSAGES.MISSING_CREDENTIALS };
      }

      const hashedPassword = this.hashPassword(password);
      const endpoint = `${API_CONFIG.BASE_URL}/?output=JSON`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(`${email}:${hashedPassword}`)}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const token = this.hashPassword(`${email}:${hashedPassword}:${Date.now()}`);
        this.storeCredentials(email, token);
        return { success: true, token, email };
      }

      if (response.status === 401) {
        return { success: false, message: ERROR_MESSAGES.INVALID_CREDENTIALS };
      }

      return {
        success: false,
        message: `${ERROR_MESSAGES.SERVER_ERROR}: ${response.status}`,
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
