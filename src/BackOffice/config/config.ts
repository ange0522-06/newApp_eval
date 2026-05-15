/**
 * Configuration centralisée de l'application
 */

export const API_CONFIG = {
  // Proxy Vite endpoint pour éviter les erreurs CORS
  // Le proxy rewrite /prestashop-api vers http://localhost/e-commerce/eval
  BASE_URL: '/prestashop-api/api',
  BO_LOGIN_URL: '/newapp-api/bo-login.php',
} as const;

export const STORAGE_KEYS = {
  AUTH: 'bo_auth',
  EMAIL: 'bo_email',
  TOKEN: 'bo_token',
} as const;

export const ERROR_MESSAGES = {
  MISSING_CREDENTIALS: 'Email et mot de passe requis',
  INVALID_CREDENTIALS: 'Identifiants incorrects',
  SERVER_ERROR: 'Erreur serveur',
  NETWORK_ERROR: 'Erreur de connexion',
} as const;
