import {
  getAllIds,
  getOne,
  getOneXml,
  postXML,
  putXML,
  deleteResource,
  uploadProductImage,
} from '../../shared/services/prestashop.service.js';
import { API_CONFIG } from '../config/config';
import {
  parseNumber,
  parseDate,
  parseAchat,
  getColumnValue,
} from '../utils/csvParser';
import { ImportTransaction } from './transactionManager';

const ID_SHOP = 1;
const ID_SHOP_GROUP = 1;
const ID_LANG = 1;
const ID_CURRENCY = 1;
const FALLBACK_ACTIVE_COUNTRY_ID = '8';
const DEFAULT_CUSTOMER_GROUP = 3;
const DEFAULT_EMPLOYEE = 1;
const INITIAL_ORDER_STATE = '1';

type CreatedResponse = { success?: boolean; id?: string | number; error?: string };
type ImagePayload = { name: string; mime: string; base64: string };
type ProductInfo = {
  id: string;
  reference: string;
  name: string;
  priceHT: number;
  priceTTC: number;
  taxRate: number;
  taxRulesGroupId: string;
};
type CombinationInfo = {
  id: string;
  productId: string;
  reference: string;
  karazany: string;
  priceHT: number;
  priceTTC: number;
};

const productsByReference = new Map<string, ProductInfo>();
const combinationsByReferenceAndValue = new Map<string, CombinationInfo>();
const resourceFullCache = new Map<string, Map<string, Record<string, string>>>();
const resourceFullInflight = new Map<string, Promise<Map<string, Record<string, string>>>>();
const stockAvailableByProductKey = new Map<string, string>();
const combinationIdByProductAndValueId = new Map<string, string>();
const combinationIdByProductAndReference = new Map<string, string>();
const productWithDefaultCombination = new Set<string>();
const productOptionInflight = new Map<string, Promise<string>>();
const productOptionValueInflight = new Map<string, Promise<string>>();
const customerInflight = new Map<string, Promise<{ id: string; secureKey: string }>>();
let stockAvailableCacheLoaded = false;
let combinationCacheLoaded = false;
let defaultCountryId: string | null = null;

function resetImportCaches(): void {
  resourceFullCache.clear();
  resourceFullInflight.clear();
  stockAvailableByProductKey.clear();
  combinationIdByProductAndValueId.clear();
  combinationIdByProductAndReference.clear();
  productWithDefaultCombination.clear();
  productOptionInflight.clear();
  productOptionValueInflight.clear();
  customerInflight.clear();
  stockAvailableCacheLoaded = false;
  combinationCacheLoaded = false;
  defaultCountryId = null;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function xml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value: string | number): string {
  return `<![CDATA[${String(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function dateOnly(dateTime: string): string {
  return dateTime.slice(0, 10);
}

function slugify(value: string): string {
  const slug = normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'produit';
}

function normalizeCategoryName(value: string): string {
  const aliases: Record<string, string> = {
    akanjo: 'Vêtements',
    vetement: 'Vêtements',
    vetements: 'Vêtements',
    accessoire: 'Accessoires',
    accessoires: 'Accessoires',
  };

  return aliases[normalize(value)] || value.trim();
}

function getCreatedId(result: CreatedResponse, label: string): string {
  if (result && result.success && result.id) return String(result.id);
  if (typeof result === 'string' || typeof result === 'number') return String(result);
  throw new Error(`${label}: creation refusee par l'API${result?.error ? ` (${result.error})` : ''}`);
}

function getSingularResourceName(resource: string): string {
  return resource.endsWith('ies') ? resource.slice(0, -3) + 'y' : resource.slice(0, -1);
}

function readResourceNode(node: Element): Record<string, string> {
  const result: Record<string, string> = {};
  Array.from(node.children).forEach((child) => {
    result[child.tagName] = child.textContent?.trim() || '';
  });
  return result;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function processInBatches<T>(items: T[], batchSize: number, handler: (item: T, index: number) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    await Promise.all(batch.map((item, offset) => handler(item, start + offset)));
  }
}

async function fetchResourceWithRetry(resource: string, retries = 2): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(`${API_CONFIG.BASE_URL}/${resource}?display=full`, {
      method: 'GET',
      headers: { 'Content-Type': 'text/xml' },
    });

    if (response.ok || response.status < 500 || attempt === retries) {
      return response;
    }

    lastResponse = response;
    await wait(300 * (attempt + 1));
  }

  return lastResponse as Response;
}

async function loadFullResource(resource: string): Promise<Map<string, Record<string, string>>> {
  const cached = resourceFullCache.get(resource);
  if (cached) return cached;

  const inflight = resourceFullInflight.get(resource);
  if (inflight) return inflight;

  const promise = (async () => {
    const response = await fetchResourceWithRetry(resource);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText.slice(0, 300)}` : ''}`);
    }

    const xmlText = await response.text();
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const singular = getSingularResourceName(resource);
    const container = doc.querySelector(resource);
    const nodes = container
      ? Array.from(container.children).filter((child) => child.tagName === singular)
      : Array.from(doc.querySelectorAll(singular));
    const map = new Map<string, Record<string, string>>();

    for (const node of nodes) {
      const id = node.getAttribute('id') || node.querySelector('id')?.textContent?.trim() || '';
      if (id) map.set(id, readResourceNode(node));
    }

    resourceFullCache.set(resource, map);
    return map;
  })();

  resourceFullInflight.set(resource, promise);
  try {
    return await promise;
  } finally {
    resourceFullInflight.delete(resource);
  }
}

function cacheResource(resource: string, id: string, data: Record<string, string>): void {
  let cache = resourceFullCache.get(resource);
  if (!cache) {
    cache = new Map();
    resourceFullCache.set(resource, cache);
  }
  cache.set(id, data);
}

function getCachedResource(resource: string, id: string): Record<string, string> | null {
  return resourceFullCache.get(resource)?.get(id) || null;
}

function stockKey(productId: string, combinationId = '0'): string {
  return `${productId}::${combinationId || '0'}`;
}

function combinationValueKey(productId: string, attributeValueId: string): string {
  return `${productId}::${attributeValueId}`;
}

function combinationReferenceKey(productId: string, reference: string): string {
  return `${productId}::${normalize(reference)}`;
}

async function postRequired(resource: string, body: string, label: string): Promise<string> {
  const result = (await postXML(resource, body)) as unknown as CreatedResponse;
  return getCreatedId(result, label);
}

async function findByField(resource: string, field: string, value: string): Promise<string | null> {
  const wanted = normalize(value);
  const resources = await loadFullResource(resource);
  for (const [id, data] of resources) {
    if (normalize(data[field] || '') === wanted) return id;
  }

  return null;
}

async function findRecordByField(resource: string, field: string, value: string): Promise<{ id: string; data: Record<string, string> } | null> {
  const wanted = normalize(value);
  const resources = await loadFullResource(resource);
  for (const [id, data] of resources) {
    if (normalize(data[field] || '') === wanted) return { id, data };
  }

  return null;
}

async function findTaxByRate(rate: number): Promise<string | null> {
  const taxes = await loadFullResource('taxes');
  for (const [id, data] of taxes) {
    const apiRate = parseFloat(String(data.rate || '0')) / 100;
    if (Math.abs(apiRate - rate) < 0.0001) return id;
  }
  return null;
}

async function getDefaultCountryId(): Promise<string> {
  const forced = localStorage.getItem('forced_id_country');
  if (forced) return forced;
  if (defaultCountryId) return defaultCountryId;

  const countries = await loadFullResource('countries');
  const activeCountries = Array.from(countries)
    .filter(([, country]) => country.active === '1');
  const preferred =
    activeCountries.find(([, country]) => country.iso_code === 'MG')
    || activeCountries.find(([, country]) => country.iso_code === 'FR')
    || activeCountries[0];

  defaultCountryId = preferred?.[0] || FALLBACK_ACTIVE_COUNTRY_ID;
  return defaultCountryId;
}

async function ensureTaxRulesGroup(rate: number, transaction: ImportTransaction): Promise<string> {
  const percent = (rate * 100).toFixed(2);
  const countryId = await getDefaultCountryId();
  const groupName = `Import Tax ${percent}% Country ${countryId}`;
  const existingGroup = await findByField('tax_rule_groups', 'name', groupName);
  if (existingGroup) return existingGroup;

  let taxId = await findTaxByRate(rate);
  if (!taxId) {
    taxId = await postRequired(
      'taxes',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax>
    <rate>${percent}</rate>
    <active>1</active>
    <name><language id="${ID_LANG}">${cdata(`Tax ${percent}%`)}</language></name>
  </tax>
</prestashop>`,
      `Taxe ${percent}%`
    );
    transaction.trackResource('fichier1', 'taxes', taxId);
    cacheResource('taxes', taxId, { rate: percent, active: '1', name: `Tax ${percent}%` });
  }

  const groupId = await postRequired(
    'tax_rule_groups',
    `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax_rule_group>
    <name>${cdata(groupName)}</name>
    <active>1</active>
    <deleted>0</deleted>
  </tax_rule_group>
</prestashop>`,
    `Groupe taxe ${percent}%`
  );
  transaction.trackResource('fichier1', 'tax_rule_groups', groupId);
  cacheResource('tax_rule_groups', groupId, { name: groupName, active: '1', deleted: '0' });

  const ruleId = await postRequired(
    'tax_rules',
    `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax_rule>
    <id_tax_rules_group>${groupId}</id_tax_rules_group>
    <id_state>0</id_state>
    <id_country>${countryId}</id_country>
    <zipcode_from>0</zipcode_from>
    <zipcode_to>0</zipcode_to>
    <id_tax>${taxId}</id_tax>
    <behavior>0</behavior>
    <description>${cdata(groupName)}</description>
  </tax_rule>
</prestashop>`,
    `Regle taxe ${percent}%`
  );
  transaction.trackResource('fichier1', 'tax_rules', ruleId);
  cacheResource('tax_rules', ruleId, { id_tax_rules_group: groupId, id_tax: taxId });

  return groupId;
}

async function ensureCategory(name: string, transaction: ImportTransaction): Promise<string> {
  const categoryName = normalizeCategoryName(name);
  const existing = await findByField('categories', 'name', categoryName);
  if (existing) return existing;

  const id = await postRequired(
    'categories',
    `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <category>
    <id_parent>2</id_parent>
    <active>1</active>
    <is_root_category>0</is_root_category>
    <name><language id="${ID_LANG}">${cdata(categoryName)}</language></name>
    <link_rewrite><language id="${ID_LANG}">${cdata(slugify(categoryName))}</language></link_rewrite>
  </category>
</prestashop>`,
    `Categorie ${categoryName}`
  );
  transaction.trackResource('fichier1', 'categories', id);
  cacheResource('categories', id, { name: categoryName, active: '1', id_parent: '2' });
  return id;
}

function setFirstTag(doc: Document, tagName: string, value: string | number): void {
  const element = doc.getElementsByTagName(tagName)[0];
  if (!element) throw new Error(`Champ ${tagName} introuvable dans le XML`);
  element.textContent = String(value);
}

function removeNotWritableFields(doc: Document): void {
  // Supprimer les champs non modifiables PrestaShop
  // Basé sur les attributs notFilterable="true" mais aussi liste explicite
  const nonWritableFields = [
    'id', 'date_add', 'date_upd', 'views', 'rating', 'indexed',
    'position_in_category', 'similarity', 'cache', 'status'
  ];
  
  doc.querySelectorAll('[notFilterable="true"]').forEach((element) => element.remove());
  nonWritableFields.forEach((fieldName) => {
    const elements = doc.getElementsByTagName(fieldName);
    // Garder le premier pour les champs qui peuvent être enfants (comme <id>)
    // mais supprimer les duplicatas et les champs de métadonnées
    if (fieldName === 'id') return; // <id> est nécessaire pour PUT
    while (elements.length > 1) {
      elements[elements.length - 1].remove();
    }
  });
}

async function updateProductTypeToCombinations(productId: string, transaction: ImportTransaction): Promise<void> {
  console.log(`  🔄 Changement du produit ${productId} en mode "combinations"...`);
  
  // 1. Récupérer le XML complet du produit
  const productXml = (await getOneXml('products', productId)) as string;
  const doc = new DOMParser().parseFromString(productXml, 'text/xml');
  
  // 2. Nettoyer les champs non modifiables
  removeNotWritableFields(doc);
  const previousWritableXml = new XMLSerializer().serializeToString(doc);
  
  // 3. Changer product_type en "combinations"
  setFirstTag(doc, 'product_type', 'combinations');
  
  // 4. Envoyer le PUT
  const nextXml = new XMLSerializer().serializeToString(doc);
  const ok = await putXML('products', productId, nextXml);
  
  if (!ok) {
    throw new Error(`Impossible de changer le type du produit ${productId} en "combinations". Vérifier les logs PrestaShop.`);
  }
  
  // 5. CRITIQUE: Attendre un peu et vérifier que le changement a vraiment pris effet
  await wait(300);
  
  // 6. Recharger le produit et vérifier que product_type est bien "combinations"
  const verifyXml = (await getOneXml('products', productId)) as string;
  const verifyDoc = new DOMParser().parseFromString(verifyXml, 'text/xml');
  const productType = verifyDoc.querySelector('product_type')?.textContent?.trim();
  
  if (productType !== 'combinations') {
    throw new Error(
      `ERREUR CRITIQUE: Le produit ${productId} n'est pas passé en mode "combinations". ` +
      `Type actuel: "${productType}". PrestaShop a possiblement rejeté le changement. ` +
      `Vérifier les logs: eval/var/logs/dev.log ou eval/var/logs/prod.log`
    );
  }
  
  console.log(`  ✓ Produit ${productId} maintenant en mode "combinations"`);
  
  // Tracker le changement pour rollback
  transaction.trackUpdate('fichier2', 'products', productId, previousWritableXml);
}

async function updateResourceField(
  transaction: ImportTransaction,
  step: string,
  resource: string,
  id: string,
  tagName: string,
  value: string | number,
  trackUpdate = true
): Promise<void> {
  const cached = getCachedResource(resource, id);
  if (cached && String(cached[tagName] ?? '') === String(value)) return;

  const previousXml = (await getOneXml(resource, id)) as string;
  const doc = new DOMParser().parseFromString(previousXml, 'text/xml');
  removeNotWritableFields(doc);
  const previousWritableXml = new XMLSerializer().serializeToString(doc);
  setFirstTag(doc, tagName, value);
  const nextXml = new XMLSerializer().serializeToString(doc);
  if (trackUpdate) transaction.trackUpdate(step, resource, id, previousWritableXml);
  const ok = await putXML(resource, id, nextXml);
  if (!ok) throw new Error(`Mise a jour impossible: ${resource}/${id}.${tagName}`);
  if (cached) cached[tagName] = String(value);
}

async function loadAllStockAvailables(): Promise<Array<{ id: string; id_product: string; id_product_attribute: string; quantity: string }>> {
  const response = await fetch(`${API_CONFIG.BASE_URL}/stock_availables?display=full`, {
    method: 'GET',
    headers: { 'Content-Type': 'text/xml' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const xmlText = await response.text();
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const nodes = Array.from(doc.querySelectorAll('stock_availables stock_available, stock_available'));

  return nodes
    .map((node) => ({
      id: node.getAttribute('id') || node.querySelector('id')?.textContent?.trim() || '',
      id_product: node.querySelector('id_product')?.textContent?.trim() || '',
      id_product_attribute: node.querySelector('id_product_attribute')?.textContent?.trim() || '0',
      quantity: node.querySelector('quantity')?.textContent?.trim() || '0',
    }))
    .filter((stock) => Boolean(stock.id));
}

async function findStockAvailableId(productId: string, combinationId = '0'): Promise<string | null> {
  try {
    if (!stockAvailableCacheLoaded) {
      const stocks = await loadAllStockAvailables();
      stockAvailableByProductKey.clear();
      for (const stock of stocks) {
        stockAvailableByProductKey.set(stockKey(stock.id_product, stock.id_product_attribute), stock.id);
        cacheResource('stock_availables', stock.id, {
          id_product: stock.id_product,
          id_product_attribute: stock.id_product_attribute,
          quantity: stock.quantity,
        });
      }
      stockAvailableCacheLoaded = true;
    }
    const match = stockAvailableByProductKey.get(stockKey(productId, combinationId));
    if (match) return match;
  } catch (error) {
    console.warn('Chargement global de stock_availables impossible, fallback sur la recherche id par id.', error);
  }

  const ids = await getAllIds('stock_availables');
  for (const id of ids) {
    try {
      const stockXml = await getOneXml('stock_availables', id, { silent404: true });
      if (!stockXml) continue;
      const stockDoc = new DOMParser().parseFromString(stockXml, 'text/xml');
      const stock = {
        id_product: stockDoc.querySelector('id_product')?.textContent?.trim() || '',
        id_product_attribute: stockDoc.querySelector('id_product_attribute')?.textContent?.trim() || '0',
      };
      if (stock.id_product === productId && String(stock.id_product_attribute || '0') === String(combinationId)) {
        stockAvailableByProductKey.set(stockKey(productId, combinationId), id);
        return id;
      }
    } catch (error) {
      console.warn(`Stock introuvable ou inaccessible pour stock_availables/${id}, on ignore.`, error);
    }
  }
  return null;
}

async function updateStock(
  transaction: ImportTransaction,
  step: string,
  productId: string,
  combinationId: string,
  quantity: number,
  trackUpdate = true
): Promise<void> {
  let stockId = await findStockAvailableId(productId, combinationId);
  if (!stockId) {
    stockId = await postRequired(
      'stock_availables',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_available>
    <id_product>${productId}</id_product>
    <id_product_attribute>${combinationId}</id_product_attribute>
    <id_shop>${ID_SHOP}</id_shop>
    <id_shop_group>0</id_shop_group>
    <quantity>${quantity}</quantity>
    <depends_on_stock>0</depends_on_stock>
    <out_of_stock>0</out_of_stock>
  </stock_available>
</prestashop>`,
      `Stock produit ${productId}/${combinationId}`
    );
    transaction.trackResource(step, 'stock_availables', stockId);
    stockAvailableByProductKey.set(stockKey(productId, combinationId), stockId);
    return;
  }

  await updateResourceField(transaction, step, 'stock_availables', stockId, 'quantity', quantity, trackUpdate);
}

async function uploadImagesWithLimit(
  products: ProductInfo[],
  imageMap: Record<string, ImagePayload>,
  transaction: ImportTransaction,
  limit = 3
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < products.length) {
      const product = products[nextIndex];
      nextIndex += 1;
      const image = imageMap[product.reference];
      // Skip if image not found - images are optional
      if (!image) {
        continue;
      }

      const result = await uploadProductImage(product.id, imagePayloadToFile(image));
      if (!result.success || !result.id) {
        throw new Error(`Upload image impossible pour ${product.reference}${result.error ? `: ${result.error}` : ''}`);
      }
      transaction.trackResource('images', `images/products/${product.id}`, String(result.id));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, products.length) }, () => worker())
  );
}

async function ensureProductOption(name: string, transaction: ImportTransaction): Promise<string> {
  const cacheKey = normalize(name);
  const inflight = productOptionInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const existing = await findByField('product_options', 'name', name);
    if (existing) return existing;

    const id = await postRequired(
      'product_options',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product_option>
    <is_color_group>${normalize(name) === 'couleur' ? 1 : 0}</is_color_group>
    <group_type>${normalize(name) === 'couleur' ? 'color' : 'select'}</group_type>
    <position>0</position>
    <name><language id="${ID_LANG}">${cdata(name)}</language></name>
    <public_name><language id="${ID_LANG}">${cdata(name)}</language></public_name>
  </product_option>
</prestashop>`,
      `Groupe attribut ${name}`
    );
    transaction.trackResource('fichier2', 'product_options', id);
    cacheResource('product_options', id, {
      name,
      public_name: name,
      is_color_group: normalize(name) === 'couleur' ? '1' : '0',
    });
    return id;
  })();

  productOptionInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    productOptionInflight.delete(cacheKey);
  }
}

async function ensureProductOptionValue(groupId: string, value: string, transaction: ImportTransaction): Promise<string> {
  const cacheKey = `${groupId}::${normalize(value)}`;
  const inflight = productOptionValueInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const values = await loadFullResource('product_option_values');
    for (const [id, data] of values) {
      if (data.id_attribute_group === groupId && normalize(data.name || '') === normalize(value)) {
        return id;
      }
    }

    const id = await postRequired(
      'product_option_values',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product_option_value>
    <id_attribute_group>${groupId}</id_attribute_group>
    <color></color>
    <position>0</position>
    <name><language id="${ID_LANG}">${cdata(value)}</language></name>
  </product_option_value>
</prestashop>`,
      `Valeur attribut ${value}`
    );
    transaction.trackResource('fichier2', 'product_option_values', id);
    cacheResource('product_option_values', id, { id_attribute_group: groupId, name: value });
    return id;
  })();

  productOptionValueInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    productOptionValueInflight.delete(cacheKey);
  }
}

function combinationKey(reference: string, karazany: string): string {
  return `${normalize(reference)}::${normalize(karazany)}`;
}

async function loadCombinationCache(force = false): Promise<void> {
  if (combinationCacheLoaded && !force) return;
  if (!combinationCacheLoaded) {
    force = true;
  }

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/combinations?display=full`, {
      method: 'GET',
      headers: { 'Content-Type': 'text/xml' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (force) {
      combinationIdByProductAndValueId.clear();
      combinationIdByProductAndReference.clear();
      productWithDefaultCombination.clear();
    }

    const xmlText = await response.text();
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const nodes = Array.from(doc.querySelectorAll('combinations > combination, prestashop > combination, combination'));
    for (const node of nodes) {
      const combinationId = node.getAttribute('id') || node.querySelector('id')?.textContent?.trim() || '';
      const idProduct = node.querySelector('id_product')?.textContent?.trim() || '';
      const reference = node.querySelector('reference')?.textContent?.trim() || '';
      const defaultOn = node.querySelector('default_on')?.textContent?.trim() || '';
      if (combinationId && idProduct && reference) {
        combinationIdByProductAndReference.set(combinationReferenceKey(idProduct, reference), combinationId);
      }
      if (combinationId && idProduct && defaultOn === '1') {
        productWithDefaultCombination.add(idProduct);
      }
      const values = Array.from(node.querySelectorAll('associations product_option_values product_option_value id'))
        .map((valueNode) => valueNode.textContent?.trim())
        .filter((value): value is string => Boolean(value));
      for (const valueId of values) {
        if (combinationId && idProduct) {
          combinationIdByProductAndValueId.set(combinationValueKey(idProduct, valueId), combinationId);
        }
      }
    }
    combinationCacheLoaded = true;
  } catch (error) {
    console.warn('Chargement global des declinaisons impossible, fallback sur la recherche id par id.', error);
  }
}

async function findCombination(productId: string, attributeValueId: string, reference?: string): Promise<string | null> {
  const cacheKey = combinationValueKey(productId, attributeValueId);
  const referenceKey = reference ? combinationReferenceKey(productId, reference) : '';
  const cached = combinationIdByProductAndValueId.get(cacheKey)
    || (referenceKey ? combinationIdByProductAndReference.get(referenceKey) : null);
  if (cached) return cached;

  await loadCombinationCache();

  const loaded = combinationIdByProductAndValueId.get(cacheKey)
    || (referenceKey ? combinationIdByProductAndReference.get(referenceKey) : null);
  if (loaded) return loaded;

  const ids = await getAllIds('combinations');
  for (const id of ids) {
    const xmlText = (await getOneXml('combinations', id)) as string;
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const idProduct = doc.querySelector('id_product')?.textContent?.trim();
    const apiReference = doc.querySelector('reference')?.textContent?.trim() || '';
    const defaultOn = doc.querySelector('default_on')?.textContent?.trim() || '';
    const values = Array.from(doc.querySelectorAll('associations product_option_values product_option_value id'))
      .map((node) => node.textContent?.trim());
    if (idProduct === productId && defaultOn === '1') productWithDefaultCombination.add(productId);
    if (idProduct === productId && apiReference) {
      combinationIdByProductAndReference.set(combinationReferenceKey(productId, apiReference), id);
    }
    if (idProduct === productId && (values.includes(attributeValueId) || (reference && normalize(apiReference) === normalize(reference)))) {
      combinationIdByProductAndValueId.set(cacheKey, id);
      return id;
    }
  }
  return null;
}

async function productHasDefaultCombination(productId: string): Promise<boolean> {
  if (productWithDefaultCombination.has(productId)) return true;
  await loadCombinationCache();
  return productWithDefaultCombination.has(productId);
}

function hasInvalidSpecificPriceRule(data: Record<string, string>): boolean {
  const reductionType = normalize(data.reduction_type || '');
  const fromQuantity = Number(data.from_quantity || '0');

  return !['amount', 'percentage'].includes(reductionType)
    || !Number.isFinite(fromQuantity)
    || fromQuantity < 1
    || String(data.price ?? '').trim() === '';
}

async function cleanupInvalidSpecificPriceRules(): Promise<void> {
  const rules = await loadFullResource('specific_price_rules');
  const invalidRules = Array.from(rules)
    .filter(([, data]) => hasInvalidSpecificPriceRule(data));

  if (invalidRules.length === 0) return;

  console.warn(
    `Suppression de ${invalidRules.length} regle(s) de prix specifique invalide(s) ` +
    'qui bloquaient la creation des declinaisons.',
    invalidRules.map(([id, data]) => ({
      id,
      name: data.name || '',
      price: data.price || '',
      from_quantity: data.from_quantity || '',
      reduction_type: data.reduction_type || '',
    }))
  );

  for (const [id] of invalidRules) {
    const ok = await deleteResource('specific_price_rules', id);
    if (!ok) {
      throw new Error(
        `Regle de prix specifique invalide ${id} impossible a supprimer. ` +
        'Elle provoque un crash PrestaShop pendant la creation des declinaisons.'
      );
    }
    rules.delete(id);
  }
}

export async function extractImagesFromZip(zipFile: File): Promise<Record<string, ImagePayload>> {
  const buffer = await zipFile.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const images: Record<string, ImagePayload> = {};

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('images.zip: structure ZIP invalide');

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('images.zip: repertoire central invalide');
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

    offset += 46 + nameLength + extraLength + commentLength;

    const baseName = fileName.split('/').pop() || '';
    if (!baseName || fileName.endsWith('/') || fileName.startsWith('__MACOSX/') || baseName.startsWith('._')) {
      continue;
    }

    const extension = baseName.split('.').pop()?.toLowerCase() || '';
    const mime = extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'png'
        ? 'image/png'
        : extension === 'gif'
          ? 'image/gif'
          : extension === 'webp'
            ? 'image/webp'
            : '';
    if (!mime) continue;

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`images.zip: entree invalide pour ${baseName}`);
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data: Uint8Array;

    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
      if (!DecompressionStreamCtor) {
        throw new Error('Votre navigateur ne peut pas decomprimer images.zip sans dependance externe');
      }
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error(`images.zip: compression non supportee pour ${baseName}`);
    }

    const reference = baseName.replace(/\.[^.]+$/, '');
    images[reference] = {
      name: baseName,
      mime,
      base64: uint8ToBase64(data),
    };
  }

  // Return empty object if no images found - import continues without images
  return images;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function imagePayloadToFile(image: ImagePayload): File {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], image.name, { type: image.mime });
}

export async function importProduits(
  rows: string[][],
  headers: string[],
  transaction: ImportTransaction
): Promise<void> {
  transaction.registerStep('fichier1');
  productsByReference.clear();
  combinationsByReferenceAndValue.clear();
  resetImportCaches();
  await Promise.all([
    loadFullResource('products'),
    loadFullResource('categories'),
    loadFullResource('taxes'),
    loadFullResource('tax_rule_groups'),
    loadFullResource('countries'),
  ]);

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2;
    const row = rows[i];
    const availableDate = dateOnly(parseDate(getColumnValue(headers, row, 'date_availability_produit')));
    const name = getColumnValue(headers, row, 'nom');
    const reference = getColumnValue(headers, row, 'reference');
    const priceTTC = parseNumber(getColumnValue(headers, row, 'prix_ttc'));
    const taxRate = parseNumber(getColumnValue(headers, row, 'Taxe'));
    const category = getColumnValue(headers, row, 'categorie');
    const wholesalePrice = parseNumber(getColumnValue(headers, row, 'prix_achat'));

    if (!name || !reference || !category || priceTTC <= 0) {
      throw new Error(`Fichier 1 ligne ${rowNumber}: nom, reference, categorie et prix_ttc sont requis`);
    }

    const priceHT = priceTTC / (1 + taxRate);
    const taxRulesGroupId = await ensureTaxRulesGroup(taxRate, transaction);
    const categoryId = await ensureCategory(category, transaction);

    let productId = await findByField('products', 'reference', reference);
    let createdProduct = false;
    if (!productId) {
      productId = await postRequired(
        'products',
        `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product>
    <id_category_default>${categoryId}</id_category_default>
    <id_tax_rules_group>${taxRulesGroupId}</id_tax_rules_group>
    <id_shop_default>${ID_SHOP}</id_shop_default>
    <reference>${xml(reference)}</reference>
    <price>${priceHT.toFixed(6)}</price>
    <wholesale_price>${wholesalePrice.toFixed(6)}</wholesale_price>
    <minimal_quantity>1</minimal_quantity>
    <active>1</active>
    <available_for_order>1</available_for_order>
    <show_price>1</show_price>
    <visibility>both</visibility>
    <state>1</state>
    <available_date>${availableDate}</available_date>
    <product_type>standard</product_type>
    <name><language id="${ID_LANG}">${cdata(name)}</language></name>
    <link_rewrite><language id="${ID_LANG}">${cdata(slugify(name))}</language></link_rewrite>
    <associations>
      <categories>
        <category><id>${categoryId}</id></category>
      </categories>
    </associations>
  </product>
</prestashop>`,
        `Produit ${reference}`
      );
      transaction.trackResource('fichier1', 'products', productId);
      cacheResource('products', productId, { reference, name, price: priceHT.toFixed(6), available_date: availableDate });
      createdProduct = true;
    }

    if (!createdProduct) {
      await updateResourceField(transaction, 'fichier1', 'products', productId, 'available_date', availableDate);
    }

    productsByReference.set(normalize(reference), {
      id: productId,
      reference,
      name,
      priceHT,
      priceTTC,
      taxRate,
      taxRulesGroupId,
    });
  }

  transaction.markStepSuccess('fichier1');
}

export async function importImages(
  imageMap: Record<string, ImagePayload>,
  transaction: ImportTransaction
): Promise<void> {
  transaction.registerStep('images');
  await uploadImagesWithLimit(Array.from(productsByReference.values()), imageMap, transaction);

  transaction.markStepSuccess('images');
}

async function validateCombinationBeforePost(
  productId: string,
  valueId: string,
  reference: string,
  rowNumber: number
): Promise<void> {
  // Vérifier que productId existe et est un nombre
  if (!productId || !/^\d+$/.test(String(productId))) {
    throw new Error(
      `Fichier 2 ligne ${rowNumber}: ID produit invalide "${productId}". ` +
      `Vérifier que le produit a été créé au fichier 1.`
    );
  }

  // Vérifier que valueId existe et est un nombre
  if (!valueId || !/^\d+$/.test(String(valueId))) {
    throw new Error(
      `Fichier 2 ligne ${rowNumber}: ID attribut invalide "${valueId}". ` +
      `Vérifier que la valeur d'attribut a été créée correctement.`
    );
  }

  // Vérifier que la référence n'est pas vide
  if (!reference || !reference.trim()) {
    throw new Error(
      `Fichier 2 ligne ${rowNumber}: référence vide pour combinaison. ` +
      `Format attendu: REFERENCE-karazany`
    );
  }

  // Vérifier que le produit existe et est en mode "combinations"
  try {
    const productXml = (await getOneXml('products', productId, { silent404: true })) as string | null;
    if (!productXml) {
      throw new Error(
        `Fichier 2 ligne ${rowNumber}: produit ${productId} introuvable. ` +
        `Vérifier que le produit a été créé au fichier 1 et importé correctement.`
      );
    }

    const productDoc = new DOMParser().parseFromString(productXml, 'text/xml');
    const productType = productDoc.querySelector('product_type')?.textContent?.trim();
    
    // CRITIQUE: le produit DOIT être en mode "combinations"
    if (productType !== 'combinations') {
      throw new Error(
        `Fichier 2 ligne ${rowNumber}: ERREUR CRITIQUE - Produit ${productId} n'est PAS en mode "combinations". ` +
        `Type actuel: "${productType}". ` +
        `La tentative de changement de type a possiblement échoué. ` +
        `Vérifier eval/var/logs/dev.log ou eval/var/logs/prod.log`
      );
    }
    
    console.log(`  ✓ Produit ${productId} est en mode "combinations"`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ERREUR CRITIQUE')) {
      throw error; // Relancer l'erreur critique
    }
    throw new Error(
      `Fichier 2 ligne ${rowNumber}: impossible de vérifier le produit ${productId}. ` +
      `Détails: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Vérifier que valueId existe dans product_option_values
  try {
    const valueXml = (await getOneXml('product_option_values', valueId, { silent404: true })) as string | null;
    if (!valueXml) {
      throw new Error(
        `Fichier 2 ligne ${rowNumber}: valeur d'attribut ${valueId} introuvable. ` +
        `Vérifier que la valeur a été créée correctement au fichier 2.`
      );
    }
    console.log(`  ✓ Valeur d'attribut ${valueId} existe`);
  } catch (error) {
    throw new Error(
      `Fichier 2 ligne ${rowNumber}: impossible de vérifier la valeur d'attribut ${valueId}. ` +
      `Détails: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log(`  ✓ Validation OK pour combinaison ${reference}`);
}

function buildCombinationXml(params: {
  productId: string;
  reference: string;
  priceImpactHT: number;
  valueId: string;
  isDefault: boolean;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <combination>
    <id_product>${params.productId}</id_product>
    <reference>${cdata(params.reference)}</reference>
    <price>${params.priceImpactHT.toFixed(6)}</price>
    <minimal_quantity>1</minimal_quantity>
    <default_on>${params.isDefault ? 1 : 0}</default_on>
    <associations>
      <product_option_values>
        <product_option_value>
          <id>${params.valueId}</id>
        </product_option_value>
      </product_option_values>
    </associations>
  </combination>
</prestashop>`;
}

async function createCombinationWithRecovery(params: {
  productId: string;
  reference: string;
  priceImpactHT: number;
  valueId: string;
  isDefault: boolean;
}): Promise<{ id: string; created: boolean }> {
  const existingBefore = await findCombination(params.productId, params.valueId, params.reference);
  if (existingBefore) return { id: existingBefore, created: false };

  const firstXml = buildCombinationXml(params);
  const firstResult = (await postXML('combinations', firstXml)) as unknown as CreatedResponse;
  if (firstResult.success && firstResult.id) {
    const id = String(firstResult.id);
    combinationIdByProductAndValueId.set(combinationValueKey(params.productId, params.valueId), id);
    combinationIdByProductAndReference.set(combinationReferenceKey(params.productId, params.reference), id);
    if (params.isDefault) productWithDefaultCombination.add(params.productId);
    return { id, created: true };
  }

  // PrestaShop peut insérer la combinaison puis crasher avant de répondre.
  // On recharge donc le cache avant de considérer la création comme échouée.
  await wait(300);
  await loadCombinationCache(true);
  const existingAfterCrash = await findCombination(params.productId, params.valueId, params.reference);
  if (existingAfterCrash) return { id: existingAfterCrash, created: false };

  if (params.isDefault) {
    const retryXml = buildCombinationXml({ ...params, isDefault: false });
    const retryResult = (await postXML('combinations', retryXml)) as unknown as CreatedResponse;
    if (retryResult.success && retryResult.id) {
      const id = String(retryResult.id);
      combinationIdByProductAndValueId.set(combinationValueKey(params.productId, params.valueId), id);
      combinationIdByProductAndReference.set(combinationReferenceKey(params.productId, params.reference), id);
      return { id, created: true };
    }

    await wait(300);
    await loadCombinationCache(true);
    const existingAfterRetry = await findCombination(params.productId, params.valueId, params.reference);
    if (existingAfterRetry) return { id: existingAfterRetry, created: false };

    throw new Error(`Declinaison ${params.reference}: creation refusee par l'API (${retryResult.error || firstResult.error || 'HTTP 500'})`);
  }

  throw new Error(`Declinaison ${params.reference}: creation refusee par l'API (${firstResult.error || 'HTTP 500'})`);
}

export async function importDeclinaisons(
  rows: string[][],
  headers: string[],
  transaction: ImportTransaction
): Promise<void> {
  transaction.registerStep('fichier2');
  await cleanupInvalidSpecificPriceRules();
  await Promise.all([
    loadFullResource('product_options'),
    loadFullResource('product_option_values'),
  ]);

  const defaultCombinationCreatedByProduct = new Set<string>();

  // Important: on traite les déclinaisons une par une.
  // Cela évite les conflits PrestaShop sur product_type, default_on et stock_available.
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const reference = getColumnValue(headers, row, 'reference');
    const specificite = getColumnValue(headers, row, 'specificité');
    const karazany = getColumnValue(headers, row, 'karazany');
    const stockInitial = parseInt(getColumnValue(headers, row, 'stock_initial'), 10);
    const priceTTCValue = getColumnValue(headers, row, 'prix_vente_ttc');

    if (!reference || Number.isNaN(stockInitial)) {
      throw new Error(`Fichier 2 ligne ${rowNumber}: reference et stock_initial sont requis`);
    }

    const product = productsByReference.get(normalize(reference));
    if (!product) throw new Error(`Fichier 2 ligne ${rowNumber}: produit ${reference} absent du fichier 1`);

    if (!specificite && !karazany) {
      await updateStock(transaction, 'fichier2', product.id, '0', stockInitial);
      continue;
    }

    if (!specificite || !karazany) {
      throw new Error(`Fichier 2 ligne ${rowNumber}: specificite et karazany doivent etre remplis ensemble`);
    }

    // Le produit doit être en mode "combinations" AVANT le POST /api/combinations.
    // Cette fonction fait un GET complet, un PUT avec vérification, et attend.
    await updateProductTypeToCombinations(product.id, transaction);

    const groupId = await ensureProductOption(specificite, transaction);
    const valueId = await ensureProductOptionValue(groupId, karazany, transaction);
    const priceTTC = priceTTCValue ? parseNumber(priceTTCValue) : product.priceTTC;
    const priceImpactHT = (priceTTC - product.priceTTC) / (1 + product.taxRate);

    const combinationReference = `${reference}-${karazany}`;
    let combinationId = await findCombination(product.id, valueId, combinationReference);
    let createdCombination = false;

    if (!combinationId) {
      const isDefault = !defaultCombinationCreatedByProduct.has(product.id)
        && !(await productHasDefaultCombination(product.id));

      // Validation diagnostique AVANT le POST combinaison
      await validateCombinationBeforePost(product.id, valueId, combinationReference, rowNumber);

      const combinationXml = buildCombinationXml({
        productId: product.id,
        reference: combinationReference,
        priceImpactHT,
        valueId,
        isDefault,
      });

      console.log(`  📤 POST combinaison: produit=${product.id}, valeur=${valueId}, reference=${combinationReference}, isDefault=${isDefault}`);
      console.log(`     XML: ${combinationXml.substring(0, 200)}...`);

      const created = await createCombinationWithRecovery({
        productId: product.id,
        reference: combinationReference,
        priceImpactHT,
        valueId,
        isDefault,
      });
      combinationId = created.id;

      if (created.created) transaction.trackResource('fichier2', 'combinations', combinationId);
      combinationIdByProductAndValueId.set(combinationValueKey(product.id, valueId), combinationId);
      combinationIdByProductAndReference.set(combinationReferenceKey(product.id, combinationReference), combinationId);
      stockAvailableCacheLoaded = false;
      combinationCacheLoaded = false;
      createdCombination = created.created;
    }

    defaultCombinationCreatedByProduct.add(product.id);

    await updateStock(transaction, 'fichier2', product.id, combinationId, stockInitial, !createdCombination);
    combinationsByReferenceAndValue.set(combinationKey(reference, karazany), {
      id: combinationId,
      productId: product.id,
      reference,
      karazany,
      priceHT: product.priceHT + priceImpactHT,
      priceTTC,
    });
  }

  transaction.markStepSuccess('fichier2');
}

async function getDefaultCarrierId(): Promise<string> {
  const forced = localStorage.getItem('forced_id_carrier');
  if (forced) return forced;

  const carriers = await loadFullResource('carriers');
  for (const [id, carrier] of carriers) {
    if (carrier.active === '1' && carrier.deleted !== '1') return id;
  }
  return carriers.keys().next().value || '1';
}

async function ensureCustomer(email: string, name: string, password: string, date: string, transaction: ImportTransaction): Promise<{ id: string; secureKey: string }> {
  const cacheKey = normalize(email);
  const inflight = customerInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const existing = await findRecordByField('customers', 'email', email);
    let id = existing?.id || null;
    let data = existing?.data || null;
    if (!id) {
      id = await postRequired(
        'customers',
        `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <id_default_group>${DEFAULT_CUSTOMER_GROUP}</id_default_group>
    <id_lang>${ID_LANG}</id_lang>
    <passwd>${cdata(password)}</passwd>
    <lastname>${cdata(name)}</lastname>
    <firstname>${cdata('Client')}</firstname>
    <email>${cdata(email)}</email>
    <active>1</active>
    <is_guest>0</is_guest>
    <id_shop>${ID_SHOP}</id_shop>
    <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
    <date_add>${date}</date_add>
    <date_upd>${date}</date_upd>
    <associations><groups><group><id>${DEFAULT_CUSTOMER_GROUP}</id></group></groups></associations>
  </customer>
</prestashop>`,
        `Client ${email}`
      );
      transaction.trackResource('fichier3', 'customers', id);
      data = (await getOne('customers', id)) as unknown as Record<string, string>;
      cacheResource('customers', id, data);
    }

    return { id, secureKey: data?.secure_key || '-1' };
  })();

  customerInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    customerInflight.delete(cacheKey);
  }
}

function resolveCartItem(item: { reference: string; quantite: number; karazany: string }) {
  const product = productsByReference.get(normalize(item.reference));
  if (!product) throw new Error(`Produit ${item.reference} introuvable pour le panier`);

  if (!item.karazany) {
    return {
      product,
      combinationId: '0',
      name: product.name,
      unitTTC: product.priceTTC,
      unitHT: product.priceHT,
    };
  }

  const combination = combinationsByReferenceAndValue.get(combinationKey(item.reference, item.karazany));
  if (!combination) throw new Error(`Declinaison ${item.reference}/${item.karazany} introuvable pour le panier`);

  return {
    product,
    combinationId: combination.id,
    name: `${product.name} - ${item.karazany}`,
    unitTTC: combination.priceTTC,
    unitHT: combination.priceHT,
  };
}

export async function importCommandes(
  rows: string[][],
  headers: string[],
  transaction: ImportTransaction
): Promise<void> {
  transaction.registerStep('fichier3');
  await Promise.all([
    loadFullResource('customers'),
    loadFullResource('carriers'),
    loadFullResource('countries'),
  ]);

  const orderStateMap: Record<string, string> = {
    'en attente paiement a la livraison': '13',
    'paiement accepte': '2',
    'paiement effectue': '2',
    'annule': '6',
    'annulee': '6',
    'erreur de paiement': '8',
    'dans le panier': '', // Empty state = cart only, no order
  };

  const carrierId = await getDefaultCarrierId();
  const countryId = await getDefaultCountryId();

  await processInBatches(rows, 4, async (row, index) => {
    const rowNumber = index + 2;
    const date = parseDate(getColumnValue(headers, row, 'date'));
    const name = getColumnValue(headers, row, 'nom');
    const email = getColumnValue(headers, row, 'email');
    const password = getColumnValue(headers, row, 'pwd');
    const address = getColumnValue(headers, row, 'adresse');
    const items = parseAchat(getColumnValue(headers, row, 'achat'));
    const stateRaw = getColumnValue(headers, row, 'etat');
    const stateKey = normalize(stateRaw);

    if (!name || !email || !password || !address || items.length === 0) {
      throw new Error(`Fichier 3 ligne ${rowNumber}: nom, email, pwd, adresse et achat sont requis`);
    }

    const customer = await ensureCustomer(email, name, password, date, transaction);
    const addressId = await postRequired(
      'addresses',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${customer.id}</id_customer>
    <id_country>${countryId}</id_country>
    <alias>${cdata(`Adresse import ${rowNumber}`)}</alias>
    <lastname>${cdata(name)}</lastname>
    <firstname>${cdata('Client')}</firstname>
    <address1>${cdata(address)}</address1>
    <postcode>101</postcode>
    <city>${cdata('Antananarivo')}</city>
    <deleted>0</deleted>
    <date_add>${date}</date_add>
    <date_upd>${date}</date_upd>
  </address>
</prestashop>`,
      `Adresse ${email}`
    );
    transaction.trackResource('fichier3', 'addresses', addressId);

    const resolved = items.map(resolveCartItem);
    const cartRowsXml = resolved.map((entry, index) => `
      <cart_row>
        <id_product>${entry.product.id}</id_product>
        <id_product_attribute>${entry.combinationId}</id_product_attribute>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_customization>0</id_customization>
        <quantity>${items[index].quantite}</quantity>
      </cart_row>`).join('');

    const cartId = await postRequired(
      'carts',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_currency>${ID_CURRENCY}</id_currency>
    <id_customer>${customer.id}</id_customer>
    <id_guest>0</id_guest>
    <id_lang>${ID_LANG}</id_lang>
    <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
    <id_shop>${ID_SHOP}</id_shop>
    <id_carrier>${carrierId}</id_carrier>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <mobile_theme>0</mobile_theme>
    <delivery_option></delivery_option>
    <secure_key>${xml(customer.secureKey)}</secure_key>
    <allow_seperated_package>0</allow_seperated_package>
    <date_add>${date}</date_add>
    <date_upd>${date}</date_upd>
    <associations><cart_rows>${cartRowsXml}</cart_rows></associations>
  </cart>
</prestashop>`,
      `Panier ${email}`
    );
    transaction.trackResource('fichier3', 'carts', cartId);

    // Check if state indicates cart-only (no order)
    const isCartOnly = !stateRaw.trim() || stateKey === 'dans le panier';
    if (isCartOnly) {
      return;
    }

    const orderStateId = orderStateMap[stateKey];
    if (!orderStateId) throw new Error(`Fichier 3 ligne ${rowNumber}: etat inconnu "${stateRaw}"`);

    const totalHT = resolved.reduce((sum, entry, index) => sum + entry.unitHT * items[index].quantite, 0);
    const totalTTC = resolved.reduce((sum, entry, index) => sum + entry.unitTTC * items[index].quantite, 0);
    const totalPaid = totalTTC.toFixed(6);
    const totalProducts = totalHT.toFixed(6);
    const totalProductsWT = totalTTC.toFixed(6);
    const orderRowsXml = resolved.map((entry, index) => `
      <order_row>
        <product_id>${entry.product.id}</product_id>
        <product_attribute_id>${entry.combinationId}</product_attribute_id>
        <product_quantity>${items[index].quantite}</product_quantity>
        <product_name>${cdata(entry.name)}</product_name>
        <product_reference>${cdata(entry.product.reference)}</product_reference>
        <product_price>${entry.unitHT.toFixed(6)}</product_price>
        <unit_price_tax_incl>${entry.unitTTC.toFixed(6)}</unit_price_tax_incl>
        <unit_price_tax_excl>${entry.unitHT.toFixed(6)}</unit_price_tax_excl>
      </order_row>`).join('');

    const orderId = await postRequired(
      'orders',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_cart>${cartId}</id_cart>
      <id_currency>${ID_CURRENCY}</id_currency>
      <id_lang>${ID_LANG}</id_lang>
      <id_shop>${ID_SHOP}</id_shop>
      <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
      <module>ps_cashondelivery</module>
      <payment><![CDATA[Cash on delivery]]></payment>
    <id_customer>${customer.id}</id_customer>
    <id_carrier>${carrierId}</id_carrier>
    <current_state>${INITIAL_ORDER_STATE}</current_state>
    <secure_key>${xml(customer.secureKey)}</secure_key>
    <total_discounts>0.000000</total_discounts>
    <total_discounts_tax_incl>0.000000</total_discounts_tax_incl>
    <total_discounts_tax_excl>0.000000</total_discounts_tax_excl>
    <total_paid>${totalPaid}</total_paid>
    <total_paid_tax_incl>${totalPaid}</total_paid_tax_incl>
    <total_paid_tax_excl>${totalProducts}</total_paid_tax_excl>
    <total_paid_real>${totalPaid}</total_paid_real>
    <total_products>${totalProducts}</total_products>
    <total_products_wt>${totalProductsWT}</total_products_wt>
    <total_shipping>0.000000</total_shipping>
    <total_shipping_tax_incl>0.000000</total_shipping_tax_incl>
    <total_shipping_tax_excl>0.000000</total_shipping_tax_excl>
    <carrier_tax_rate>0.000000</carrier_tax_rate>
    <total_wrapping>0.000000</total_wrapping>
    <total_wrapping_tax_incl>0.000000</total_wrapping_tax_incl>
    <total_wrapping_tax_excl>0.000000</total_wrapping_tax_excl>
    <conversion_rate>1.000000</conversion_rate>
    <valid>0</valid>
    <date_add>${date}</date_add>
    <date_upd>${date}</date_upd>
    <associations>
      <order_rows>${orderRowsXml}
      </order_rows>
    </associations>
  </order>
</prestashop>`,
      `Commande ${email}`
    );
    transaction.trackResource('fichier3', 'orders', orderId);

    if (orderStateId !== INITIAL_ORDER_STATE) {
      await updateResourceField(transaction, 'fichier3', 'orders', orderId, 'current_state', orderStateId, false);
      await updateResourceField(transaction, 'fichier3', 'orders', orderId, 'valid', orderStateId === '2' ? 1 : 0, false);
    }

    const historyId = await postRequired(
      'order_histories',
      `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_employee>${DEFAULT_EMPLOYEE}</id_employee>
    <id_order_state>${orderStateId}</id_order_state>
    <id_order>${orderId}</id_order>
    <date_add>${date}</date_add>
  </order_history>
</prestashop>`,
      `Historique commande ${orderId}`
    );
    transaction.trackResource('fichier3', 'order_histories', historyId);
  });

  transaction.markStepSuccess('fichier3');
}
