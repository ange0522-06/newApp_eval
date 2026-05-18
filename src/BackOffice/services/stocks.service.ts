import { getFullResource } from '@/shared/services/prestashop.service.js';

export interface StockCategoryRow {
  categoryId: string;
  categoryName: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
}

export async function getStockAnalysis(): Promise<StockCategoryRow[]> {
  try {
    const [productsRaw, categoriesRaw, stockAvailablesRaw] = await Promise.all([
      getFullResource('products', '[id,id_category_default]').catch(() => []),
      getFullResource('categories', '[id,name]').catch(() => []),
      getFullResource('stock_availables', '[id,id_product,id_product_attribute,quantity]').catch(() => [])
    ]);

    const categoryMap = new Map<string, string>();
    for (const c of categoriesRaw as any[]) {
      categoryMap.set(c.id, c.name || `Catégorie ${c.id}`);
    }

    const productMap = new Map<string, any>();
    for (const p of productsRaw as any[]) {
      productMap.set(p.id, p);
    }

    const stockMap = new Map<string, StockCategoryRow>();

    for (const stock of stockAvailablesRaw as any[]) {
      if (stock.id_product_attribute && stock.id_product_attribute !== '0') continue; // Only process main products for simplicity

      const productId = stock.id_product;
      const product = productMap.get(productId);
      
      const catId = product?.id_category_default || 'unknown';
      const catName = categoryMap.get(catId) || (catId === 'unknown' ? 'Inconnue' : `Catégorie ${catId}`);

      const qty = parseInt(stock.quantity || '0', 10) || 0;
      const physicalQty = qty;
      const reservedQty = 0;
      const availableQty = physicalQty - reservedQty;

      const row = stockMap.get(catId) || {
        categoryId: catId,
        categoryName: catName,
        physicalQty: 0,
        reservedQty: 0,
        availableQty: 0
      };

      row.physicalQty += physicalQty;
      row.reservedQty += reservedQty;
      row.availableQty += availableQty;

      stockMap.set(catId, row);
    }

    return Array.from(stockMap.values()).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  } catch (error) {
    console.error("Erreur lors de la récupération de l'analyse des stocks:", error);
    throw error;
  }
}
