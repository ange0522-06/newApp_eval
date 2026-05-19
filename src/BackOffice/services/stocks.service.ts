import { getFullResource, getOneXml, putXML } from '@/shared/services/prestashop.service.js';

export interface StockCategoryRow {
  categoryId: string;
  categoryName: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
}

export interface ProductStockOption {
  stockId: string;
  productId: string;
  combinationId: string;
  label: string;
  reference: string;
  quantity: number;
  categoryId: string;
  categoryName: string;
}

export interface StockEvolutionRow {
  date: string;
  incomingQty: number;
  outgoingQty: number;
  balanceQty: number;
  source: string;
}

type StockHistoryEntry = {
  productId: string;
  combinationId: string;
  previousQty: number;
  nextQty: number;
  delta: number;
  date: string;
  source: string;
}

/**
 * Réservé = commandes avec paiement effectué (état 11)
 * Les paniers actifs sans commande sont gérés séparément via getCartReservedQty
 */
const RESERVED_ORDER_STATES = new Set(['11']);

/**
 * Mouvement physique = livraison (état 5) → la quantité physique diminue
 */
const DELIVERED_STATE = '5';

const HISTORY_KEY = 'bo_stock_manual_history';

function parseQty(value: unknown): number {
  const qty = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(qty) ? qty : 0;
}

function dateOnly(value: string): string {
  return (value || new Date().toISOString()).slice(0, 10);
}

function readHistory(): StockHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendHistory(entry: StockHistoryEntry): void {
  const history = readHistory();
  history.push(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-500)));
}

function setFirstTag(doc: Document, tagName: string, value: string | number): void {
  const element = doc.getElementsByTagName(tagName)[0];
  if (!element) throw new Error(`Champ ${tagName} introuvable dans le XML stock.`);
  element.textContent = String(value);
}

function sanitizeStockXml(doc: Document): void {
  doc.querySelectorAll('[notFilterable="true"]').forEach((element) => element.remove());
}

async function getReferenceByCombination(): Promise<Map<string, string>> {
  const rows = await getFullResource('combinations', '[id,reference]').catch(() => []);
  return new Map((rows as any[]).map((combination) => [
    combination.id,
    combination.reference || `Declinaison #${combination.id}`,
  ]));
}

async function getBaseMaps() {
  const [productsRaw, categoriesRaw] = await Promise.all([
    getFullResource('products', '[id,reference,name,id_category_default]').catch(() => []),
    getFullResource('categories', '[id,name]').catch(() => []),
  ]);

  const categoryMap = new Map<string, string>();
  for (const category of categoriesRaw as any[]) {
    categoryMap.set(category.id, category.name || `Categorie ${category.id}`);
  }

  const productMap = new Map<string, any>();
  for (const product of productsRaw as any[]) {
    productMap.set(product.id, product);
  }

  return { productMap, categoryMap };
}

/**
 * Quantités réservées via les commandes à l'état "paiement effectué" (id_state = 11).
 */
async function getOrderReservedQty(): Promise<Map<string, number>> {
  const [ordersRaw, detailsRaw] = await Promise.all([
    getFullResource('orders', '[id,current_state]').catch(() => []),
    getFullResource('order_details', '[id_order,product_id,product_attribute_id,product_quantity]').catch(() => []),
  ]);

  const reservedOrderIds = new Set(
    (ordersRaw as any[])
      .filter((order) => RESERVED_ORDER_STATES.has(order.current_state || ''))
      .map((order) => order.id)
  );

  const reservedByKey = new Map<string, number>();
  for (const detail of detailsRaw as any[]) {
    if (!reservedOrderIds.has(detail.id_order)) continue;
    const key = `${detail.product_id || ''}_${detail.product_attribute_id || '0'}`;
    reservedByKey.set(key, (reservedByKey.get(key) || 0) + parseQty(detail.product_quantity));
  }

  return reservedByKey;
}

/**
 * Quantités réservées via les paniers actifs (paniers sans commande associée = "dans le panier" ou "vide").
 * Ces paniers n'ont pas encore généré de commande.
 */
async function getCartReservedQty(): Promise<Map<string, number>> {
  try {
    const [cartsRaw, cartProductsRaw, ordersRaw] = await Promise.all([
      getFullResource('carts', '[id,id_customer]').catch(() => []),
      getFullResource('customizations', '[id_cart,id_product,id_product_attribute,quantity]').catch(() => []),
      getFullResource('orders', '[id,id_cart]').catch(() => []),
    ]);

    // IDs des paniers déjà convertis en commande
    const cartIdsWithOrder = new Set(
      (ordersRaw as any[]).map((order) => order.id_cart).filter(Boolean)
    );

    // Paniers actifs = paniers avec un client, non encore commandés
    const activeCartIds = new Set(
      (cartsRaw as any[])
        .filter((cart) => cart.id_customer && !cartIdsWithOrder.has(cart.id))
        .map((cart) => cart.id)
    );

    const reservedByKey = new Map<string, number>();
    for (const row of cartProductsRaw as any[]) {
      if (!activeCartIds.has(row.id_cart)) continue;
      const key = `${row.id_product || ''}_${row.id_product_attribute || '0'}`;
      reservedByKey.set(key, (reservedByKey.get(key) || 0) + parseQty(row.quantity));
    }

    return reservedByKey;
  } catch {
    return new Map();
  }
}

/**
 * Fusionne les réservations commandes (état 11) + paniers actifs.
 */
async function getReservedQuantityByStockKey(): Promise<Map<string, number>> {
  const [orderReserved, cartReserved] = await Promise.all([
    getOrderReservedQty(),
    getCartReservedQty(),
  ]);

  const merged = new Map<string, number>(orderReserved);
  for (const [key, qty] of cartReserved) {
    merged.set(key, (merged.get(key) || 0) + qty);
  }

  return merged;
}

export async function getProductStockOptions(): Promise<ProductStockOption[]> {
  const [stockAvailablesRaw, baseMaps, combinationReferences] = await Promise.all([
    getFullResource('stock_availables', '[id,id_product,id_product_attribute,quantity]').catch(() => []),
    getBaseMaps(),
    getReferenceByCombination(),
  ]);

  return (stockAvailablesRaw as any[])
    .map((stock) => {
      const product = baseMaps.productMap.get(stock.id_product);
      const categoryId = product?.id_category_default || 'unknown';
      const combinationId = stock.id_product_attribute || '0';
      const combinationLabel = combinationId !== '0'
        ? ` - ${combinationReferences.get(combinationId) || `Declinaison #${combinationId}`}`
        : '';

      return {
        stockId: stock.id,
        productId: stock.id_product || '',
        combinationId,
        label: `${product?.name || `Produit #${stock.id_product}`}${combinationLabel}`,
        reference: product?.reference || '',
        quantity: parseQty(stock.quantity),
        categoryId,
        categoryName: baseMaps.categoryMap.get(categoryId) || (categoryId === 'unknown' ? 'Inconnue' : `Categorie ${categoryId}`),
      };
    })
    .filter((stock) => stock.stockId && stock.productId)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function updateProductStockQuantity(option: ProductStockOption, nextQty: number): Promise<ProductStockOption> {
  const normalizedQty = Math.max(0, Math.floor(nextQty || 0));
  const previousXml = await getOneXml('stock_availables', option.stockId) as string;
  const doc = new DOMParser().parseFromString(previousXml, 'text/xml');
  sanitizeStockXml(doc);
  setFirstTag(doc, 'quantity', normalizedQty);

  const ok = await putXML('stock_availables', option.stockId, new XMLSerializer().serializeToString(doc));
  if (!ok) throw new Error('Mise a jour du stock impossible.');

  appendHistory({
    productId: option.productId,
    combinationId: option.combinationId,
    previousQty: option.quantity,
    nextQty: normalizedQty,
    delta: normalizedQty - option.quantity,
    date: new Date().toISOString(),
    source: 'BO',
  });

  return { ...option, quantity: normalizedQty };
}

export async function addProductStockQuantity(option: ProductStockOption, addedQty: number): Promise<ProductStockOption> {
  return updateProductStockQuantity(option, option.quantity + Math.max(0, Math.floor(addedQty || 0)));
}

/**
 * Evolution du stock physique d'un produit.
 * Un mouvement de sortie (livraison) est enregistré quand une commande passe à l'état livré (5).
 */
export async function getStockEvolution(option: ProductStockOption): Promise<StockEvolutionRow[]> {
  const rowsByDate = new Map<string, { incomingQty: number; outgoingQty: number; sources: Set<string> }>();

  function addMovement(date: string, delta: number, source: string) {
    const key = dateOnly(date);
    const row = rowsByDate.get(key) || { incomingQty: 0, outgoingQty: 0, sources: new Set<string>() };
    if (delta >= 0) row.incomingQty += delta;
    else row.outgoingQty += Math.abs(delta);
    row.sources.add(source);
    rowsByDate.set(key, row);
  }

  // Historique des ajustements manuels via le BO
  for (const entry of readHistory()) {
    if (entry.productId === option.productId && (entry.combinationId || '0') === option.combinationId) {
      addMovement(entry.date, entry.delta, entry.source);
    }
  }

  // Sorties physiques = commandes livrées (état 5)
  const [ordersRaw, detailsRaw] = await Promise.all([
    getFullResource('orders', '[id,date_add,current_state]').catch(() => []),
    getFullResource('order_details', '[id_order,product_id,product_attribute_id,product_quantity]').catch(() => []),
  ]);

  const deliveredOrders = new Map(
    (ordersRaw as any[])
      .filter((order) => order.current_state === DELIVERED_STATE)
      .map((order) => [order.id, order.date_add || ''])
  );

  for (const detail of detailsRaw as any[]) {
    const orderDate = deliveredOrders.get(detail.id_order);
    if (!orderDate) continue;
    if (detail.product_id !== option.productId) continue;
    if ((detail.product_attribute_id || '0') !== option.combinationId) continue;
    addMovement(orderDate, -parseQty(detail.product_quantity), 'Livraison');
  }

  const sorted = Array.from(rowsByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const totalDelta = sorted.reduce((sum, [, row]) => sum + row.incomingQty - row.outgoingQty, 0);
  let balance = option.quantity - totalDelta;

  return sorted.map(([date, row]) => {
    balance += row.incomingQty - row.outgoingQty;
    return {
      date,
      incomingQty: row.incomingQty,
      outgoingQty: row.outgoingQty,
      balanceQty: balance,
      source: Array.from(row.sources).join(', '),
    };
  }).reverse();
}

/**
 * Analyse des stocks par catégorie.
 * - Qté physique  : quantité actuelle dans PrestaShop (diminue à la livraison)
 * - Qté réservée  : commandes payées (état 11) + paniers actifs non encore commandés
 * - Qté disponible: physique - réservée
 */
export async function getStockAnalysis(): Promise<StockCategoryRow[]> {
  try {
    const [stockOptions, reservedByKey] = await Promise.all([
      getProductStockOptions(),
      getReservedQuantityByStockKey(),
    ]);

    const stockMap = new Map<string, StockCategoryRow>();
    for (const stock of stockOptions) {
      const key = `${stock.productId}_${stock.combinationId || '0'}`;
      const reservedQty = reservedByKey.get(key) || 0;
      const row = stockMap.get(stock.categoryId) || {
        categoryId: stock.categoryId,
        categoryName: stock.categoryName,
        physicalQty: 0,
        reservedQty: 0,
        availableQty: 0,
      };

      row.physicalQty += stock.quantity;
      row.reservedQty += reservedQty;
      stockMap.set(stock.categoryId, row);
    }

    // Calculer availableQty après agrégation complète par catégorie
    for (const row of stockMap.values()) {
      row.availableQty = Math.max(0, row.physicalQty - row.reservedQty);
    }

    return Array.from(stockMap.values()).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  } catch (error) {
    console.error("Erreur lors de la recuperation de l'analyse des stocks:", error);
    throw error;
  }
}