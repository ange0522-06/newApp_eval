import { getFullResource } from '@/shared/services/prestashop.service.js'
import { getAllOrders, type Order } from './orders.service'

export type CategoryProfit = {
  categoryId: string
  categoryName: string
  salesHT: number
  purchaseHT: number
  profitHT: number
}

export type FinancialStats = {
  totalAmountHT: number
  totalPurchaseHT: number
  profitsByCategory: CategoryProfit[]
}

const DASHBOARD_ORDER_STATES = new Set(['2', '5']) // Paid or Delivered

export async function getFinancialStats(): Promise<FinancialStats> {
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
  const catProfitMap = new Map<string, CategoryProfit>()

  let totalAmountHT = 0;
  let totalPurchaseHT = 0;

  for (const order of payableOrders) {
    const rate = parseFloat(order.conversion_rate || '1') || 1;
    
    // Using total_paid_tax_excl directly for the total sales
    const amountHTOrig = parseFloat(order.total_paid_tax_excl || '0') || 0;
    const amountHT = rate !== 0 ? amountHTOrig / rate : amountHTOrig;
    totalAmountHT += amountHT;

    const orderRowsArray = orderDetailsMap.get(order.id) || [];
    if (orderRowsArray.length > 0) {
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

  return {
    totalAmountHT,
    totalPurchaseHT,
    profitsByCategory: Array.from(catProfitMap.values()).sort((a, b) => b.profitHT - a.profitHT),
  };
}
