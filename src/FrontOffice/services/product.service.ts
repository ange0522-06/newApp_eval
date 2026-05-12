import { getAllIds, getOne } from '@/shared/services/prestashop.service.js'
import type { Product, ProductDetail, Combination, Attribute } from '@/FrontOffice/types/product.types'

// ─── Helpers XML ─────────────────────────────────────────────────────────────

/**
 * Parse une chaîne XML en document XML
 */
function parseXML(xmlText: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(xmlText, 'text/xml')
}

/**
 * Récupère la valeur texte d'un élément XML
 */
function getText(doc: Document | Element, selector: string): string {
  return doc.querySelector(selector)?.textContent?.trim() ?? ''
}

/**
 * Récupère la valeur texte d'un élément XML pour une langue donnée
 * ex: <name><language id="1">Tshirt</language></name>
 */
function getLangText(doc: Document | Element, selector: string, langId = '1'): string {
  return doc.querySelector(`${selector} language[id="${langId}"]`)?.textContent?.trim() ?? ''
}

// ─── Image ───────────────────────────────────────────────────────────────────

/**
 * Construit l'URL de l'image principale d'un produit
 * Utilise le proxy Vite /prestashop-api
 */
export function getProductImageUrl(productId: string): string {
  return `/prestashop-api/images/products/${productId}`
}

// ─── Taxes ───────────────────────────────────────────────────────────────────

/**
 * Récupère le taux de taxe à partir d'un id_tax_rules_group
 * Retourne le taux sous forme décimale ex: 0.1165
 */
async function getTaxRate(idTaxRulesGroup: string): Promise<number> {
  try {
    if (!idTaxRulesGroup || idTaxRulesGroup === '0') return 0

    const xml = await getOne('tax_rule_groups', idTaxRulesGroup)
    const doc = parseXML(xml)

    // Récupérer les tax_rules liées à ce groupe
    const taxRuleIds = await getAllIds('tax_rules')
    for (const id of taxRuleIds) {
      const ruleXml = await getOne('tax_rules', id)
      const ruleDoc = parseXML(ruleXml)
      const groupId = getText(ruleDoc, 'id_tax_rules_group')
      if (groupId === idTaxRulesGroup) {
        const idTax = getText(ruleDoc, 'id_tax')
        const taxXml = await getOne('taxes', idTax)
        const taxDoc = parseXML(taxXml)
        const rate = parseFloat(getText(taxDoc, 'rate'))
        return isNaN(rate) ? 0 : rate / 100
      }
    }
    return 0
  } catch {
    return 0
  }
}

// ─── Attributs ───────────────────────────────────────────────────────────────

/**
 * Récupère les attributs d'une combinaison
 */
async function getCombinationAttributes(combinationId: string): Promise<Attribute[]> {
  try {
    const xml = await getOne('combinations', combinationId)
    const doc = parseXML(xml)

    // Récupérer tous les id_attribute dans la combinaison
    const attributeElements = doc.querySelectorAll('associations attributes attribute')
    const attributes: Attribute[] = []

    for (const el of attributeElements) {
      const idAttribute = el.querySelector('id')?.textContent?.trim() ?? ''
      if (!idAttribute) continue

      const attrXml = await getOne('product_option_values', idAttribute)
      const attrDoc = parseXML(attrXml)
      const attrName = getLangText(attrDoc, 'name')
      const idGroup = getText(attrDoc, 'id_attribute_group')

      const groupXml = await getOne('product_options', idGroup)
      const groupDoc = parseXML(groupXml)
      const groupName = getLangText(groupDoc, 'name')

      attributes.push({
        id: idAttribute,
        name: attrName,
        groupName: groupName
      })
    }

    return attributes
  } catch {
    return []
  }
}

// ─── Stock ───────────────────────────────────────────────────────────────────

/**
 * Récupère le stock disponible d'un produit ou d'une combinaison
 */
async function getStock(productId: string, combinationId = '0'): Promise<number> {
  try {
    const ids = await getAllIds('stock_availables')
    for (const id of ids) {
      const xml = await getOne('stock_availables', id)
      const doc = parseXML(xml)
      const pid = getText(doc, 'id_product')
      const cid = getText(doc, 'id_product_attribute')
      if (pid === productId && cid === combinationId) {
        return parseInt(getText(doc, 'quantity')) || 0
      }
    }
    return 0
  } catch {
    return 0
  }
}

// ─── Produits ─────────────────────────────────────────────────────────────────

/**
 * Récupère tous les produits (données légères pour la page d'accueil)
 */
export async function getAllProducts(): Promise<Product[]> {
  try {
    const ids = await getAllIds('products')
    console.log(`✅ Nombre de produits trouvés: ${ids.length}`)
    
    const products: Product[] = []

    for (const id of ids) {
      try {
        const xml = await getOne('products', id)
        const doc = parseXML(xml)

        const active = getText(doc, 'active')
        const name = getLangText(doc, 'name')
        const price = parseFloat(getText(doc, 'price')) || 0
        const idTaxRulesGroup = getText(doc, 'id_tax_rules_group')
        const taxRate = await getTaxRate(idTaxRulesGroup)

        // ✅ Inclure TOUS les produits (actifs et inactifs)
        products.push({
          id,
          reference:            getText(doc, 'reference'),
          name:                 name || `Produit ${id}`,
          price,
          priceTTC:             parseFloat((price * (1 + taxRate)).toFixed(2)),
          taxRate,
          imageUrl:             getProductImageUrl(id),
          id_category_default:  getText(doc, 'id_category_default'),
          active:               active === '1'
        })
        console.log(`✅ Produit chargé: ${name} (ID: ${id}, Actif: ${active})`)
      } catch (error) {
        console.error(`❌ Erreur pour le produit ${id}:`, error)
        continue
      }
    }

    console.log(`✅ Total produits chargés: ${products.length}`)
    return products
  } catch (error) {
    console.error('❌ Erreur getAllProducts:', error)
    throw error
  }
}

/**
 * Récupère un produit avec tous ses détails (fiche produit)
 */
export async function getProductById(id: string): Promise<ProductDetail> {
  try {
    const xml = await getOne('products', id)
    const doc = parseXML(xml)

    const price = parseFloat(getText(doc, 'price')) || 0
    const idTaxRulesGroup = getText(doc, 'id_tax_rules_group')
    const taxRate = await getTaxRate(idTaxRulesGroup)

    // Récupérer les combinaisons liées à ce produit
    const combinationElements = doc.querySelectorAll('associations combinations combination')
    const combinations: Combination[] = []

    for (const el of combinationElements) {
      try {
        const combinationId = el.querySelector('id')?.textContent?.trim() ?? ''
        if (!combinationId) continue

        const combXml = await getOne('combinations', combinationId)
        const combDoc = parseXML(combXml)
        const combPrice = parseFloat(getText(combDoc, 'price')) || 0
        const stock = await getStock(id, combinationId)
        const attributes = await getCombinationAttributes(combinationId)

        combinations.push({
          id: combinationId,
          price: parseFloat((combPrice * (1 + taxRate)).toFixed(2)),
          stock,
          attributes
        })
      } catch {
        continue
      }
    }

    return {
      id,
      reference:            getText(doc, 'reference'),
      name:                 getLangText(doc, 'name'),
      description:          getLangText(doc, 'description'),
      price,
      priceTTC:             parseFloat((price * (1 + taxRate)).toFixed(2)),
      taxRate,
      imageUrl:             getProductImageUrl(id),
      id_category_default:  getText(doc, 'id_category_default'),
      active:               getText(doc, 'active') === '1',
      combinations,
      hasCombinations:      combinations.length > 0
    }
  } catch (error) {
    console.error(`Erreur getProductById(${id}):`, error)
    throw error
  }
}