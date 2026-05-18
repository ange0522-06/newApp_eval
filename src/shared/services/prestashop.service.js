/**
 * Service de communication avec l'API PrestaShop en XML
 * Toutes les requêtes utilisent XML uniquement (pas de JSON)
 *
 * Utilise le proxy Vite pour éviter les problèmes CORS
 * La clé API est injectée automatiquement via le proxy (ws_key dans l'URL)
 */

import { API_CONFIG } from '../../BackOffice/config/config';

const BASE_URL = API_CONFIG.BASE_URL;
const DEBUG_API = false;

function debugLog(...args) {
  if (DEBUG_API) console.log(...args);
}

const NON_WRITABLE_FIELDS_BY_RESOURCE = {
  products: [
    'id_default_image',
    'id_default_combination',
    'manufacturer_name',
    'position_in_category',
    'quantity',
    'type'
  ],
};

/**
 * Nettoie un XML provenant d'un GET avant de le renvoyer en PUT.
 * PrestaShop renvoie certains champs calcules/non modifiables; si on les
 * renvoie tels quels, le WebService refuse le PUT et le rollback echoue.
 */
export function sanitizeXmlForPut(resource, xmlBody) {
  if (!xmlBody || typeof xmlBody !== 'string') return xmlBody;

  try {
    const doc = new DOMParser().parseFromString(xmlBody, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return xmlBody;

    doc.querySelectorAll('[notFilterable="true"]').forEach((element) => element.remove());

    const fields = NON_WRITABLE_FIELDS_BY_RESOURCE[resource] || [];
    for (const field of fields) {
      Array.from(doc.getElementsByTagName(field)).forEach((element) => element.remove());
    }

    return new XMLSerializer().serializeToString(doc);
  } catch (error) {
    console.warn(`Nettoyage XML PUT impossible pour ${resource}, XML envoye tel quel.`, error);
    return xmlBody;
  }
}

/**
 * Récupère tous les IDs d'une ressource
 * @param {string} resource - Nom de la ressource (products, customers, orders, stock_availables, etc.)
 * @returns {Promise<Array<string>>} Tableau de tous les IDs trouvés
 */
export async function getAllIds(resource) {
  try {
    const url = `${BASE_URL}/${resource}`;
    debugLog(`📡 Récupération des IDs pour: ${resource} | URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    debugLog(`📋 XML reçu (premiers 1000 chars):`, xmlText.substring(0, 1000));
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Vérifier les erreurs de parsing XML
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      console.error(`❌ Erreur de parsing XML pour ${resource}:`, xmlDoc);
      return [];
    }

    // Chercher les enfants directs de la ressource (ex: product, customer, order, stock_available)
    const resourceElement = xmlDoc.querySelector(resource);
    
    if (!resourceElement) {
      console.warn(`⚠️ Ressource ${resource} non trouvée dans le XML`);
      // Afficher la structure du document pour débogage
      const prestashop = xmlDoc.querySelector('prestashop');
      if (prestashop) {
        debugLog(`📦 Éléments disponibles dans prestashop:`, Array.from(prestashop.children).map(el => el.tagName));
      }
      return [];
    }

    // Récupérer le nom singulier de la ressource (products -> product, stock_availables -> stock_available)
    const singular = resource.endsWith('ies') ? resource.slice(0, -3) + 'y' : resource.slice(0, -1);
    debugLog(`🔍 Cherche éléments singuliers: "${singular}"`);
    
    // Chercher tous les éléments enfants directs avec le nom singulier
    const elements = resourceElement.querySelectorAll(`:scope > ${singular}`);
    const ids = Array.from(elements).map(el => el.getAttribute('id')).filter(id => id);

    debugLog(`✅ IDs trouvés pour ${resource}:`, ids);
    return ids;
  } catch (error) {
    console.error(`❌ Erreur getAllIds(${resource}):`, error);
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

    debugLog(`Données parsées pour ${resource}/${id}:`, result);
    return result;
  } catch (error) {
    console.error(`Erreur getOne(${resource}, ${id}):`, error);
    throw error;
  }
}

/**
 * Récupère le XML brut d'une ressource spécifique par son ID.
 * Cette variante est utile quand le code appelant veut parser le XML lui-même.
 * @param {string} resource - Nom de la ressource
 * @param {string|number} id - ID de la ressource
 * @returns {Promise<string>} Texte XML brut de la ressource
 */
export async function getOneXml(resource, id, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}/${resource}/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/xml'
      }
    })

    if (!response.ok) {
      if (options.silent404 && response.status === 404) {
        return null
      }
      // Ne pas logger ici — laisser l'appelant gérer l'erreur silencieusement
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    if (options.silent404 && String(error?.message || error).includes('HTTP 404')) {
      return null
    }
    // Propager sans logger — preloadStocks() gère déjà le catch
    throw error
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
    const body = sanitizeXmlForPut(resource, xmlBody);
    const response = await fetch(`${BASE_URL}/${resource}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/xml'
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Log the XML we sent for easier debugging (similar to postXML)
      try {
        console.error(`📋 XML envoyé (PUT ${resource}/${id}):\n${body}`);
      } catch (e) {
        // ignore logging errors
      }

      // Try to parse XML error response
      let parsedError = '';
      try {
        if (errorText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(errorText, 'text/xml');
          
          // Try to extract error from various PrestaShop error XML formats
          const errorElements = [
            xmlDoc.querySelector('error'),
            xmlDoc.querySelector('message'),
            xmlDoc.querySelector('errors > error'),
            xmlDoc.querySelector('prestashop > error'),
            xmlDoc.querySelector('prestashop > message')
          ];
          
          for (const elem of errorElements) {
            if (elem && elem.textContent) {
              parsedError = elem.textContent;
              break;
            }
          }
        }
      } catch (parseErr) {
        // Not XML, use raw text
        parsedError = errorText || '(Réponse vide du serveur)';
      }
      
      const errorMsg = `PUT échoué pour ${resource}/${id}: HTTP ${response.status}. Details: ${parsedError || errorText.substring(0, 500)}`;
      console.warn(errorMsg);
      console.error(`Réponse complète du serveur:\n${errorText}`);
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
      const errorText = await response.text();
      
      // Try to parse XML error response
      let parsedError = '';
      try {
        if (errorText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(errorText, 'text/xml');
          
          // Try to extract error from various PrestaShop error XML formats
          const errorElements = [
            xmlDoc.querySelector('error'),
            xmlDoc.querySelector('message'),
            xmlDoc.querySelector('errors > error'),
            xmlDoc.querySelector('prestashop > error'),
            xmlDoc.querySelector('prestashop > message')
          ];
          
          for (const elem of errorElements) {
            if (elem && elem.textContent) {
              parsedError = elem.textContent;
              break;
            }
          }
        }
      } catch (parseErr) {
        // Not XML, use raw text
        parsedError = errorText || '(Réponse vide du serveur)';
      }
      
      const errorMsg = `DELETE échoué pour ${resource}/${id}: HTTP ${response.status}. Details: ${parsedError || errorText.substring(0, 500)}`;
      console.warn(errorMsg);
      console.error(`Réponse complète du serveur:\n${errorText}`);
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
 * @returns {Promise<{success: boolean, id?: string, error?: string}>} Résultat avec ID si succès
 */
export async function postXML(resource, xmlBody) {
  try {
    // Log BEFORE sending
    debugLog(`📤 [PRE-POST] Envoi à ${resource}: ${xmlBody.length} chars`);
    if (resource === 'orders') {
      debugLog(`📋 [FULL ORDER XML]:\n${xmlBody}`);
    }
    
    const response = await fetch(`${BASE_URL}/${resource}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml'
      },
      body: xmlBody
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Try to parse XML error response
      let parsedError = '';
      try {
        if (errorText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(errorText, 'text/xml');
          
          // Try to extract error from various PrestaShop error XML formats
          const errorElements = [
            xmlDoc.querySelector('error'),
            xmlDoc.querySelector('message'),
            xmlDoc.querySelector('errors > error'),
            xmlDoc.querySelector('prestashop > error'),
            xmlDoc.querySelector('prestashop > message')
          ];
          
          for (const elem of errorElements) {
            if (elem && elem.textContent) {
              parsedError = elem.textContent;
              break;
            }
          }
        }
      } catch (parseErr) {
        // Not XML, use raw text
        parsedError = errorText || '(Réponse vide du serveur)';
      }
      
      const errorMsg = `HTTP ${response.status}: ${response.statusText}. Details: ${parsedError || errorText.substring(0, 500)}`;
      console.error(`❌ POST échoué pour ${resource}:`, errorMsg);
      console.error(`📋 XML envoyé (COMPLET):\n${xmlBody}`);
      console.error(`📨 Réponse serveur (${errorText.length} chars):\n${errorText || '(VIDE)'}`);
      
      // Si HTTP 500 avec réponse vide, donner des instructions claires
      if (response.status >= 500 && (!errorText || errorText.trim() === '')) {
        const debugMsg = [
          `\n⚠️  ERREUR SERVEUR AVEC RÉPONSE VIDE (HTTP ${response.status})`,
          `\nRessource: ${resource}`,
          `URL: ${BASE_URL}/${resource}`,
          `XML envoyé:\n${xmlBody}`,
          `\n🔧 DIAGNOSTIC:`,
          `1. Vérifier les logs PrestaShop:`,
          `   - eval/var/logs/dev.log`,
          `   - eval/var/logs/prod.log`,
          `2. Vérifier les logs Apache:`,
          `   - xampp/apache/logs/error.log`,
          `3. Possibles causes:`,
          `   - Erreur PHP ou SQL dans PrestaShop`,
          `   - Données invalides ou doubloon d'identifiant`,
          `   - Attributs XML non reconnus ou mal formés`,
          `   - Permissions insuffisantes sur la ressource`,
          `\nConsulter les logs mentionnés ci-dessus pour plus de détails.`
        ].join('\n');
        console.error(debugMsg);
      }
      
      return { success: false, error: errorMsg };
    }

    const responseText = await response.text();
    
    // Parser la réponse XML pour trouver l'ID
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, 'text/xml');
      const idElement = xmlDoc.querySelector('id');
      const id = idElement?.textContent;
      
      debugLog(`POST succès pour ${resource}, ID: ${id}`);
      return { success: true, id };
    } catch (parseError) {
      console.warn(`Impossible de parser ID de la réponse pour ${resource}`);
      return { success: true, id: undefined };
    }
  } catch (error) {
    const errorMsg = `Erreur postXML(${resource}): ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Envoie une image produit via l'API images de PrestaShop.
 * @param {string|number} productId
 * @param {File|Blob} file
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function uploadProductImage(productId, file) {
  try {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${BASE_URL}/images/products/${productId}`, {
      method: 'POST',
      body: formData
    });

    const responseText = await response.text();
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}. Details: ${responseText.substring(0, 200)}`
      };
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, 'text/xml');
    const id = xmlDoc.querySelector('image > id')?.textContent?.trim()
      || xmlDoc.querySelector('id')?.textContent?.trim();

    return { success: true, id };
  } catch (error) {
    return {
      success: false,
      error: `Erreur uploadProductImage(${productId}): ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
