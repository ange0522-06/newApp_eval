/**
 * Déclarations de types pour prestashop.service.js
 * Ce fichier permet à TypeScript de reconnaître les fonctions
 * exportées depuis prestashop.service.js
 */

/**
 * Récupère tous les IDs d'une ressource PrestaShop
 * @param resource - Nom de la ressource (products, customers, orders, etc.)
 * @returns Tableau de tous les IDs trouvés
 */
export function getAllIds(resource: string): Promise<string[]>

/**
 * Récupère une ressource spécifique par son ID
 * @param resource - Nom de la ressource
 * @param id - ID de la ressource
 * @returns Texte XML brut de la ressource
 */
export function getOne(resource: string, id: string): Promise<string>

/**
 * Récupère le XML brut d'une ressource spécifique par son ID
 * @param resource - Nom de la ressource
 * @param id - ID de la ressource
 * @returns Texte XML brut de la ressource
 */
export function getOneXml(resource: string, id: string, options?: { silent404?: boolean }): Promise<string | null>

/**
 * Crée une nouvelle ressource via POST
 * @param resource - Nom de la ressource
 * @param xmlBody - Corps de la requête en XML
 * @returns true si succès, false sinon
 */
export function postXML(
  resource: string,
  xmlBody: string
): Promise<{ success: boolean, id?: string, error?: string }>

/**
 * Met à jour une ressource via PUT
 * @param resource - Nom de la ressource
 * @param id - ID de la ressource
 * @param xmlBody - Corps de la requête en XML
 * @returns true si succès, false sinon
 */
export function putXML(resource: string, id: string, xmlBody: string): Promise<boolean>

/**
 * Supprime une ressource via DELETE
 * @param resource - Nom de la ressource
 * @param id - ID de la ressource
 * @returns true si succès, false sinon
 */
export function deleteResource(resource: string, id: string): Promise<boolean>

export function uploadProductImage(productId: string | number, file: File | Blob): Promise<{ success: boolean, id?: string, error?: string }>
