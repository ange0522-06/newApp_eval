import { getFullResource } from '@/shared/services/prestashop.service.js'
import { getAllOrders, type Order } from './orders.service'

export type DashboardDayRow = {
  date: string
  count: number
  amount: number
}

export type DashboardStateRow = {
  id: string
  label: string
  count: number
  amount: number
}

export type DashboardCategoryProfit = {
  categoryId: string
  categoryName: string
  salesHT: number
  purchaseHT: number
  profitHT: number
}

export type DashboardStats = {
  days: DashboardDayRow[]
  states: DashboardStateRow[]
  totalOrders: number
  totalAmount: number
  totalAmountHT: number
  totalPurchaseHT: number
  profitsByCategory: DashboardCategoryProfit[]
  pendingCarts: number
}

const STATE_LABELS: Record<string, string> = {
  cart: 'Dans le panier',
  '13': 'Paiement a la livraison',
  '2': 'Paiement accepte',
  '5': 'Livre',
  '6': 'Annule',
}

const DASHBOARD_ORDER_STATES = new Set(['2', '5'])

function toAmount(order: Order): number {
  const total = parseFloat(order.total_paid || '0') || 0
  const rate = parseFloat(order.conversion_rate || '1') || 1
  return rate !== 0 ? total / rate : total
}

function toAmountHT(order: Order): number {
  const total = parseFloat(order.total_paid_tax_excl || '0') || 0
  const rate = parseFloat(order.conversion_rate || '1') || 1
  return rate !== 0 ? total / rate : total
}

function toDay(dateValue: string): string {
  if (!dateValue) return 'Sans date'
  return dateValue.slice(0, 10)
}

async function countPendingCarts(orderCartIds: Set<string>): Promise<number> {
  try {
    const carts = await getFullResource('carts')
    let count = 0

    for (const cart of carts as any[]) {
      const cartId = cart.id || ''
      if (orderCartIds.has(cartId)) continue
      if (cart?.id_customer) count += 1
    }

    return count
  } catch {
    return 0
  }
}

// ✅ OPTIMISATION: Cache pour les stats du dashboard (2 minutes)
const dashboardStatsCache = { stats: null as DashboardStats | null, timestamp: 0 };
const DASHBOARD_STATS_CACHE_TTL = 2 * 60 * 1000;

export async function getDashboardStats(): Promise<DashboardStats> {
  // ✅ OPTIMISATION: Vérifier le cache avant de charger
  const now = Date.now();
  if (dashboardStatsCache.stats && (now - dashboardStatsCache.timestamp) < DASHBOARD_STATS_CACHE_TTL) {
    console.log(`✓ Stats dashboard (cache): ${dashboardStatsCache.stats.totalOrders} commandes`);
    return dashboardStatsCache.stats;
  }

  console.log('📥 Chargement des stats du dashboard...');
  const loadStartTime = performance.now();

  const [orders, productsRaw, categoriesRaw, orderDetailsRaw] = await Promise.all([
    getAllOrders(),
    getFullResource('products', '[id,wholesale_price,id_category_default]').catch(() => []),
    getFullResource('categories', '[id,name]').catch(() => []),
    getFullResource('order_details', '[id_order,product_id,product_quantity,unit_price_tax_excl]').catch(() => [])
  ]);

  const productMap = new Map((productsRaw as any[]).map(p => [p.id, p]));
  const categoryMap = new Map((categoriesRaw as any[]).map(c => [c.id, c.name]));
  
  // Group order details by order id
  const orderDetailsMap = new Map<string, any[]>();
  for (const detail of orderDetailsRaw as any[]) {
    if (!detail.id_order) continue;
    const list = orderDetailsMap.get(detail.id_order) || [];
    list.push(detail);
    orderDetailsMap.set(detail.id_order, list);
  }

  const payableOrders = orders.filter(order => DASHBOARD_ORDER_STATES.has(order.current_state))
  const dayMap = new Map<string, DashboardDayRow>()
  const stateMap = new Map<string, DashboardStateRow>()
  const catProfitMap = new Map<string, DashboardCategoryProfit>()
  const orderCartIds = new Set(orders.map(order => order.id_cart).filter(Boolean))

  let totalAmountHT = 0;
  let totalPurchaseHT = 0;

  for (const order of payableOrders) {
    const amountTTC = toAmount(order)
    const amountHT = toAmountHT(order)
    totalAmountHT += amountHT;

    const day = toDay(order.date_add)
    const dayRow = dayMap.get(day) || { date: day, count: 0, amount: 0 }
    dayRow.count += 1
    dayRow.amount += amountTTC
    dayMap.set(day, dayRow)

    const stateId = order.current_state || '13'
    const stateRow = stateMap.get(stateId) || {
      id: stateId,
      label: STATE_LABELS[stateId] || order.stateName || `Etat ${stateId}`,
      count: 0,
      amount: 0,
    }
    stateRow.count += 1
    stateRow.amount += amountTTC
    stateMap.set(stateId, stateRow)

    // Calculate Purchase HT and Category Profits
    const orderRowsArray = orderDetailsMap.get(order.id) || [];
    if (orderRowsArray.length > 0) {
      const rate = parseFloat(order.conversion_rate || '1') || 1;
      for (const row of orderRowsArray) {
        if (!row.product_id) continue;
        
        const qty = parseFloat(row.product_quantity || '0') || 0;
        const sellPriceExclOrig = parseFloat(row.unit_price_tax_excl || '0') || 0;
        const sellPriceExcl = rate !== 0 ? sellPriceExclOrig / rate : sellPriceExclOrig;
        const totalSellHT = sellPriceExcl * qty;
        
        const product = productMap.get(row.product_id);
        const wholesalePriceOrig = product ? parseFloat(product.wholesale_price || '0') : 0;
        const purchasePriceExcl = rate !== 0 ? wholesalePriceOrig / rate : wholesalePriceOrig;
        const totalBuyHT = purchasePriceExcl * qty;
        
        totalPurchaseHT += totalBuyHT;
        
        const catId = product?.id_category_default || 'unknown';
        const catName = categoryMap.get(catId) || (catId === 'unknown' ? 'Inconnue' : `Catégorie ${catId}`);
        
        const catProfit = catProfitMap.get(catId) || {
          categoryId: catId,
          categoryName: catName,
          salesHT: 0,
          purchaseHT: 0,
          profitHT: 0
        };
        
        catProfit.salesHT += totalSellHT;
        catProfit.purchaseHT += totalBuyHT;
        catProfit.profitHT = catProfit.salesHT - catProfit.purchaseHT;
        
        catProfitMap.set(catId, catProfit);
      }
    }
  }

  const pendingCarts = await countPendingCarts(orderCartIds)
  if (pendingCarts > 0) {
    stateMap.set('cart', {
      id: 'cart',
      label: STATE_LABELS.cart,
      count: pendingCarts,
      amount: 0,
    })
  }

  const result: DashboardStats = {
    days: Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
    states: Array.from(stateMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    totalOrders: payableOrders.length,
    totalAmount: payableOrders.reduce((sum, order) => sum + toAmount(order), 0),
    totalAmountHT,
    totalPurchaseHT,
    profitsByCategory: Array.from(catProfitMap.values()).sort((a, b) => b.profitHT - a.profitHT),
    pendingCarts,
  };

  // ✅ OPTIMISATION: Mettre en cache les résultats
  dashboardStatsCache.stats = result;
  dashboardStatsCache.timestamp = now;
  console.log(`✓ Stats dashboard chargées en ${Math.round(performance.now() - loadStartTime)}ms`);

  return result;
}
