/**
 * Service de communication avec l'API PrestaShop en XML
 * Toutes les requêtes utilisent XML uniquement (pas de JSON)
 *
 * Utilise le proxy Vite pour éviter les problèmes CORS
 * La clé API est injectée automatiquement via le proxy (ws_key dans l'URL)
 */

import { API_CONFIG } from '../config/config';

const BASE_URL = API_CONFIG.BASE_URL;

/**
 * Récupère tous les IDs d'une ressource
 * @param {string} resource - Nom de la ressource (products, customers, orders, stock_availables, etc.)
 * @returns {Promise<Array<string>>} Tableau de tous les IDs trouvés
 */
export async function getAllIds(resource) {
  try {
    const response = await fetch(`${BASE_URL}/${resource}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    console.log(`XML reçu pour ${resource}:`, xmlText.substring(0, 500));
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Chercher les enfants directs de la ressource (ex: product, customer, order, stock_available)
    const resourceElement = xmlDoc.querySelector(resource);
    
    if (!resourceElement) {
      console.warn(`Ressource ${resource} non trouvée dans le XML`);
      return [];
    }

    // Récupérer le nom singulier de la ressource (products -> product, stock_availables -> stock_available)
    const singular = resource.endsWith('ies') ? resource.slice(0, -3) + 'y' : resource.slice(0, -1);
    
    // Chercher tous les éléments enfants directs avec le nom singulier
    const elements = resourceElement.querySelectorAll(singular);
    const ids = Array.from(elements).map(el => el.getAttribute('id')).filter(id => id);

    console.log(`IDs trouvés pour ${resource}:`, ids);
    return ids;
  } catch (error) {
    console.error(`Erreur getAllIds(${resource}):`, error);
    throw error;
  }
}

/**
 * Récupère une ressource spécifique par son ID
 * @param {string} resource - Nom de la ressource
 * @param {string|number} id - ID de la ressource
 * @returns {Promise<Object>} Objet avec les données parsées du XML
 */
export async function getOne(resource, id) {
  try {
    const response = await fetch(`${BASE_URL}/${resource}/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Récupérer le nom singulier de la ressource
    const singular = resource.endsWith('ies') ? resource.slice(0, -3) + 'y' : resource.slice(0, -1);
    
    // Chercher l'élément de ressource
    let resourceElement = xmlDoc.querySelector(singular);
    
    if (!resourceElement) {
      // Essayer avec la version plurielle
      resourceElement = xmlDoc.querySelector(resource);
    }
    
    if (!resourceElement) {
      // Fallback: prendre le premier enfant de prestashop qui n'est pas du texte
      const prestashop = xmlDoc.querySelector('prestashop');
      if (prestashop && prestashop.children.length > 0) {
        resourceElement = prestashop.children[0];
      }
    }
    
    if (!resourceElement) {
      console.warn(`Élément pour ${resource} non trouvé dans la réponse XML`);
      return {};
    }

    // Convertir tous les nœuds enfants en objet
    const result = {};
    Array.from(resourceElement.children).forEach(child => {
      result[child.tagName] = child.textContent || '';
    });

    console.log(`Données parsées pour ${resource}/${id}:`, result);
    return result;
  } catch (error) {
    console.error(`Erreur getOne(${resource}, ${id}):`, error);
    throw error;
  }
}

/**
 * Met à jour une ressource via PUT
 * @param {string} resource - Nom de la ressource
 * @param {string|number} id - ID de la ressource
 * @param {string} xmlBody - Corps de la requête en XML
 * @returns {Promise<boolean>} true si succès, false sinon
 */
export async function putXML(resource, id, xmlBody) {
  try {
    const response = await fetch(`${BASE_URL}/${resource}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/xml'
      },
      body: xmlBody
    });

    if (!response.ok) {
      console.warn(`PUT échoué: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Erreur putXML(${resource}, ${id}):`, error);
    return false;
  }
}

/**
 * Supprime une ressource via DELETE
 * @param {string} resource - Nom de la ressource
 * @param {string|number} id - ID de la ressource
 * @returns {Promise<boolean>} true si succès, false sinon
 */
export async function deleteResource(resource, id) {
  try {
    const response = await fetch(`${BASE_URL}/${resource}/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    if (!response.ok) {
      console.warn(`DELETE échoué: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Erreur deleteResource(${resource}, ${id}):`, error);
    return false;
  }
}

/**
 * Crée une nouvelle ressource via POST
 * @param {string} resource - Nom de la ressource
 * @param {string} xmlBody - Corps de la requête en XML
 * @returns {Promise<boolean>} true si succès, false sinon
 */
export async function postXML(resource, xmlBody) {
  try {
    const response = await fetch(`${BASE_URL}/${resource}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml'
      },
      body: xmlBody
    });

    if (!response.ok) {
      console.warn(`POST échoué: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Erreur postXML(${resource}):`, error);
    return false;
  }
}