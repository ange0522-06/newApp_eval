import { getAllIds, getFullResource, getOneXml } from '@/shared/services/prestashop.service.js'
import type { Product, ProductDetail, Combination, Attribute, Category } from '@/FrontOffice/types/product.types'

// ─── Helpers XML ─────────────────────────────────────────────────────────────

function parseXML(xmlText: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(xmlText, 'text/xml')
}

function getText(doc: Document | Element, selector: string): string {
  return doc.querySelector(selector)?.textContent?.trim() ?? ''
}

function getLangText(doc: Document | Element, selector: string, langId = '1'): string {
  return doc.querySelector(`${selector} language[id="${langId}"]`)?.textContent?.trim() ?? ''
}

function getMainImageId(doc: Document | Element): string {
  return doc.querySelector('associations images image id')?.textContent?.trim() ?? ''
}

function normalizeProductDate(value: string): string {
  if (!value || value.startsWith('0000-00-00')) return ''
  return value
}

function getProductReleaseDate(doc: Document | Element): string {
  return normalizeProductDate(getText(doc, 'available_date')) ||
    normalizeProductDate(getText(doc, 'date_add'))
}

function getReleaseBadge(dateValue: string): 'HOT' | 'NEW' | undefined {
  if (!dateValue) return undefined

  const releaseDate = new Date(dateValue.replace(' ', 'T'))
  if (Number.isNaN(releaseDate.getTime())) return undefined

  const ageInDays = (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24)
  if (ageInDays < 0) return undefined
  if (ageInDays <= 1) return 'HOT'
  if (ageInDays <= 7) return 'NEW'
  return undefined
}

// ─── Image ───────────────────────────────────────────────────────────────────

export function getProductImageUrl(productId: string, imageId: string): string {
  const baseUrl = import.meta.env.VITE_API_URL_BACKEND || 'http://localhost/e-commerce/eval'
  if (!imageId) return '/placeholder.png'
  // PrestaShop découpe l'ID en sous-dossiers : 16 → /1/6/16-home_default.jpg
  const folders = imageId.split('').join('/')
  return `${baseUrl}/img/p/${folders}/${imageId}-home_default.jpg`
}

// ─── SOLUTION 2 : Cache des taxes ────────────────────────────────────────────
/**
 * Cache global des taux de taxe
 * Clé = id_tax_rules_group, Valeur = taux décimal (ex: 0.1165)
 * Évite de refaire les mêmes appels API pour la même taxe
 * Ex: 10 produits avec la même taxe → 1 seul appel au lieu de 10
 */
const taxRateCache = new Map<string, number>()

async function getTaxRate(idTaxRulesGroup: string): Promise<number> {
  if (!idTaxRulesGroup || idTaxRulesGroup === '0') return 0

  // Retourner directement si déjà en cache → zéro appel API
  if (taxRateCache.has(idTaxRulesGroup)) {
    return taxRateCache.get(idTaxRulesGroup)!
  }

  try {
    const taxRules = await getFullResource('tax_rules', '[id,id_tax_rules_group,id_tax]')
    const taxes = await getFullResource('taxes', '[id,rate]')
    for (const rule of taxRules as any[]) {
      const groupId = rule.id_tax_rules_group || ''

      if (groupId === idTaxRulesGroup) {
        const idTax = rule.id_tax || ''
        if (!idTax || idTax === '0') return 0

        const tax = (taxes as any[]).find((entry) => entry.id === idTax)
        const rate = parseFloat(tax?.rate || '0')
        const result = isNaN(rate) ? 0 : rate / 100

        // Sauvegarder dans le cache pour les prochains produits
        taxRateCache.set(idTaxRulesGroup, result)
        return result
      }
    }
    return 0
  } catch {
    return 0
  }
}

// ─── Attributs ───────────────────────────────────────────────────────────────

async function getCombinationAttributes(combinationId: string): Promise<Attribute[]> {
  try {
    const xml: string = await getOneXml('combinations', combinationId)
    const doc = parseXML(xml)
    const attributeElements = doc.querySelectorAll('associations attributes attribute')
    const attributes: Attribute[] = []

    // Charger tous les attributs d'une combination EN PARALLÈLE
    await Promise.allSettled(
      Array.from(attributeElements).map(async (el) => {
        const idAttribute = el.querySelector('id')?.textContent?.trim() ?? ''
        if (!idAttribute) return

        const [attrXml, ] = await Promise.all([
          getOneXml('product_option_values', idAttribute)
        ])
        const attrDoc = parseXML(attrXml)
        const attrName = getLangText(attrDoc, 'name')
        const idGroup = getText(attrDoc, 'id_attribute_group')

        const groupXml: string = await getOneXml('product_options', idGroup)
        const groupDoc = parseXML(groupXml)
        const groupName = getLangText(groupDoc, 'name')

        attributes.push({ id: idAttribute, name: attrName, groupName })
      })
    )

    return attributes
  } catch {
    return []
  }
}

// ─── Stock ───────────────────────────────────────────────────────────────────

// Cache global des stocks — évite de rappeler getAllIds('stock_availables') pour chaque produit
const stockCache = new Map<string, number>()
let stockCacheLoaded = false

/**
 * Précharge tous les stocks en une seule fois
 * Appelée une fois avant le chargement des produits
 */
async function preloadStocks(): Promise<void> {
  if (stockCacheLoaded) return
  try {
    const stocks = await getFullResource('stock_availables', '[id,id_product,id_product_attribute,quantity]')
    for (const stock of stocks as any[]) {
        const pid = stock.id_product || ''
        const cid = stock.id_product_attribute || '0'
        const qty = parseInt(stock.quantity || '0') || 0
        // Clé unique = productId_combinationId
        stockCache.set(`${pid}_${cid}`, qty)
    }
    stockCacheLoaded = true
  } catch {
    stockCacheLoaded = false
  }
}

function getStockFromCache(productId: string, combinationId = '0'): number {
  return stockCache.get(`${productId}_${combinationId}`) ?? 0
}

// ─── SOLUTION 1 : Chargement d'un seul produit ───────────────────────────────
/**
 * Charge les données d'un seul produit
 * Utilisée dans Promise.allSettled() pour le chargement parallèle
 */
async function loadSingleProduct(id: string): Promise<Product | null> {
  try {
    const xml: string = await getOneXml('products', id)
    const doc = parseXML(xml)

    const price = parseFloat(getText(doc, 'price')) || 0
    const idTaxRulesGroup = getText(doc, 'id_tax_rules_group')
    const taxRate = await getTaxRate(idTaxRulesGroup)
    const imageId = getMainImageId(doc)
    const name = getLangText(doc, 'name')
    const idCategoryDefault = getText(doc, 'id_category_default')
    const availableDate = getProductReleaseDate(doc)

    // Récupérer TOUTES les catégories du produit (pas juste la catégorie par défaut)
    const categoryElements = doc.querySelectorAll('associations categories category')
    const categoryIds = Array.from(categoryElements)
      .map(el => el.querySelector('id')?.textContent?.trim() ?? '')
      .filter(Boolean)

    return {
      id,
      reference:           getText(doc, 'reference'),
      name:                name || `Produit ${id}`,
      price,
      priceTTC:            parseFloat((price * (1 + taxRate)).toFixed(2)),
      taxRate,
      imageUrl:            getProductImageUrl(id, imageId),
      id_category_default: idCategoryDefault,
      category_ids:        categoryIds.length > 0 ? categoryIds : [idCategoryDefault],
      availableDate,
      releaseBadge:        getReleaseBadge(availableDate),
      active:              getText(doc, 'active') === '1'
    }
  } catch {
    return null
  }
}

// ─── Produits ─────────────────────────────────────────────────────────────────

/**
 * Récupère tous les produits
 *
 * SOLUTION 1 : Promise.allSettled → charge tous les produits EN PARALLÈLE
 * SOLUTION 2 : taxRateCache → ne calcule chaque taxe qu'une seule fois
 * SOLUTION 3 : callback onProductLoaded → affichage progressif dans HomeView
 *
 * @param onProductLoaded - callback appelé dès qu'un produit est chargé
 *   → permet à HomeView d'afficher chaque produit au fur et à mesure
 */
export async function getAllProducts(
  onProductLoaded?: (product: Product) => void
): Promise<Product[]> {
  try {
    const ids = await getAllIds('products')

    const products: Product[] = []

    // SOLUTION 1 : charger tous les produits en parallèle
    await Promise.allSettled(
      ids.map(async (id) => {
        const product = await loadSingleProduct(id)
        if (product) {
          products.push(product)
          // SOLUTION 3 : notifier HomeView dès que ce produit est prêt
          onProductLoaded?.(product)
        }
      })
    )

    return products
  } catch (error) {
    console.error('Erreur getAllProducts:', error)
    throw error
  }
}

/**
 * Récupère un produit avec tous ses détails (fiche produit)
 */
export async function getProductById(id: string): Promise<ProductDetail> {
  try {
    // Précharger les stocks si pas encore fait
    await preloadStocks()

    const xml: string = await getOneXml('products', id)
    const doc = parseXML(xml)

    const price = parseFloat(getText(doc, 'price')) || 0
    const idTaxRulesGroup = getText(doc, 'id_tax_rules_group')
    const taxRate = await getTaxRate(idTaxRulesGroup)
    const imageId = getMainImageId(doc)
    const availableDate = getProductReleaseDate(doc)

    // Récupérer les IDs des combinaisons
    const combinationElements = doc.querySelectorAll('associations combinations combination')
    const combinationIds = Array.from(combinationElements)
      .map(el => el.querySelector('id')?.textContent?.trim() ?? '')
      .filter(Boolean)

    // SOLUTION 1 : charger toutes les combinaisons EN PARALLÈLE
    const combinationResults = await Promise.allSettled(
      combinationIds.map(async (combinationId) => {
        const combXml: string = await getOneXml('combinations', combinationId)
        const combDoc = parseXML(combXml)
        const combPrice = parseFloat(getText(combDoc, 'price')) || 0
        const stock = getStockFromCache(id, combinationId)
        const attributes = await getCombinationAttributes(combinationId)

        return {
          id: combinationId,
          price: parseFloat(((price + combPrice) * (1 + taxRate)).toFixed(2)),
          stock,
          attributes
        } as Combination
      })
    )

    const combinations: Combination[] = combinationResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<Combination>).value)

    // Récupérer TOUTES les catégories du produit
    const categoryElements = doc.querySelectorAll('associations categories category')
    const categoryIds = Array.from(categoryElements)
      .map(el => el.querySelector('id')?.textContent?.trim() ?? '')
      .filter(Boolean)
    const idCategoryDefault = getText(doc, 'id_category_default')

    return {
      id,
      reference:           getText(doc, 'reference'),
      name:                getLangText(doc, 'name'),
      description:         getLangText(doc, 'description'),
      price,
      priceTTC:            parseFloat((price * (1 + taxRate)).toFixed(2)),
      taxRate,
      imageUrl:            getProductImageUrl(id, imageId),
      id_category_default: idCategoryDefault,
      category_ids:        categoryIds.length > 0 ? categoryIds : [idCategoryDefault],
      availableDate,
      releaseBadge:        getReleaseBadge(availableDate),
      active:              getText(doc, 'active') === '1',
      stock:               getStockFromCache(id, '0'),
      combinations,
      hasCombinations:     combinations.length > 0
    }
  } catch (error) {
    console.error(`Erreur getProductById(${id}):`, error)
    throw error
  }
}

// ─── Catégories ───────────────────────────────────────────────────────────────

/**
 * Récupère toutes les catégories (hors racine et accueil)
 */

function labelDuplicateCategoryNames(categories: Category[]): Category[] {
  const nameCounts = categories.reduce((counts, category) => {
    counts.set(category.name, (counts.get(category.name) || 0) + 1)
    return counts
  }, new Map<string, number>())

  return categories.map(category => {
    if ((nameCounts.get(category.name) || 0) <= 1) return category
    return {
      ...category,
      name: `${category.name} #${category.id}`,
    }
  })
}

export async function getAllCategories(): Promise<Category[]> {
  try {
    const rows = await getFullResource('categories', '[id,name,id_parent]')
    const categories: Category[] = []

    for (const category of rows as any[]) {
      try {
        const id = category.id || ''
        const name = category.name || ''
        const idParent = category.id_parent || ''
        
        // Exclure la catégorie racine (id=1) et accueil (id=2)
        if (id !== '1' && id !== '2') {
          categories.push({
            id,
            name: name || `Catégorie ${id}`,
            parent_id: idParent
          })
        }
      } catch {
        // Ignorer les catégories inaccessibles
        continue
      }
    }

    return labelDuplicateCategoryNames(categories)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Erreur getAllCategories:', error)
    return []
  }
}
