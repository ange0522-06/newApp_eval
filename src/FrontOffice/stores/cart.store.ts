import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAllIds, getOne, postXML } from '@/shared/services/prestashop.service.js'

const ID_SHOP = 1
const ID_CURRENCY = 1
const ID_LANG = 1

export interface CartItem {
  productId: string
  combinationId?: string
  name: string
  imageUrl?: string
  price: number // HT or TTC depending on how product.priceTTC is used
  quantity: number
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])

  // Persist in localStorage
  function loadFromStorage() {
    const raw = localStorage.getItem('cart_items')
    if (raw) {
      try { items.value = JSON.parse(raw) } catch { items.value = [] }
    }
  }
  function saveToStorage() {
    localStorage.setItem('cart_items', JSON.stringify(items.value))
  }

  function addItem(item: CartItem) {
    const existing = items.value.find(i => i.productId === item.productId && (i.combinationId || '') === (item.combinationId || ''))
    if (existing) {
      existing.quantity += item.quantity
    } else {
      items.value.push(item)
    }
    saveToStorage()
  }

  function removeItem(productId: string, combinationId?: string) {
    const key = (combinationId || '')
    items.value = items.value.filter(i => !(i.productId === productId && (i.combinationId || '') === key))
    saveToStorage()
  }

  function updateQuantity(productId: string, combinationId: string | undefined, qty: number) {
    const it = items.value.find(i => i.productId === productId && (i.combinationId || '') === (combinationId || ''))
    if (it) {
      it.quantity = Math.max(1, qty)
      saveToStorage()
    }
  }

  function clear() {
    items.value = []
    saveToStorage()
  }

  loadFromStorage()

  /**
   * Trouve l'ID client PrestaShop à partir de l'email
   */
  async function findCustomerIdByEmail(email: string): Promise<string | null> {
    const ids = await getAllIds('customers')
    for (const id of ids) {
      try {
        const data = (await getOne('customers', id)) as any
        if (data.email === email) return id
      } catch {
        continue
      }
    }
    return null
  }

  /**
   * Place une commande réelle via l'API PrestaShop
   * Retourne l'objet { success, orderId?, error? }
   */
  async function placeOrder(
    address: { firstname: string, lastname: string, address1: string, city: string, postcode: string, phone?: string },
    options?: { forceModuleId?: string | number, forceCarrierId?: string | number }
  ) {
    const isCustomerAuthenticated =
      localStorage.getItem('auth_authenticated') === 'true' &&
      localStorage.getItem('auth_email') !== null &&
      localStorage.getItem('auth_token') !== null
    if (!isCustomerAuthenticated) return { success: false, error: 'not_authenticated' }

    const email = localStorage.getItem('auth_email')
    if (!email) return { success: false, error: 'missing_email' }

    // 1) retrouver l'id client par email
    const idCustomer = await findCustomerIdByEmail(email)
    if (!idCustomer) return { success: false, error: 'customer_not_found' }

    // 2) créer l'adresse
    const xmlAddress = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop>\n  <address>\n    <id_customer>${idCustomer}</id_customer>\n    <id_country>18</id_country>\n    <firstname><![CDATA[${address.firstname}]]></firstname>\n    <lastname><![CDATA[${address.lastname}]]></lastname>\n    <address1><![CDATA[${address.address1}]]></address1>\n    <city><![CDATA[${address.city}]]></city>\n    <postcode><![CDATA[${address.postcode}]]></postcode>\n    <phone><![CDATA[${address.phone || ''}]]></phone>\n    <active>1</active>\n  </address>\n</prestashop>`

    const resultAddr: any = await postXML('addresses', xmlAddress)
    let idAddress = ''
    if (resultAddr && ((resultAddr.success && resultAddr.id) || typeof resultAddr === 'string' || typeof resultAddr === 'number')) {
      idAddress = resultAddr.id ? resultAddr.id : String(resultAddr)
    } else {
      return { success: false, error: 'address_creation_failed' }
    }

    // 3) créer le panier avec les lignes (cart_rows)
    // Allow forcing carrier/module via options or localStorage (admin can set)
    const forcedCarrierLS = localStorage.getItem('forced_id_carrier')
    const forcedModuleLS = localStorage.getItem('forced_id_module')

    // Try to find a carrier to include in the cart
    let idCarrier: number | string = 0
    if (options && options.forceCarrierId) idCarrier = options.forceCarrierId
    else if (forcedCarrierLS) idCarrier = forcedCarrierLS
    try {
      const carrierIds = await getAllIds('carriers')
      for (const cid of carrierIds) {
        try {
          const c: any = await getOne('carriers', cid)
          if (c && (c.active === '1' || c.active === 1)) { idCarrier = cid; break }
        } catch {}
      }
      if (!idCarrier && carrierIds.length) idCarrier = carrierIds[0]
    } catch (e) {
      idCarrier = 0
    }

    const cartRowsXml = items.value.map(it => {
      const idProductAttr = it.combinationId || 0
      return `<cart_row>\n        <id_product>${it.productId}</id_product>\n        <id_product_attribute>${idProductAttr}</id_product_attribute>\n        <quantity>${it.quantity}</quantity>\n      </cart_row>`
    }).join('\n')

    const xmlCart = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop>\n  <cart>\n    <id_customer>${idCustomer}</id_customer>\n    <id_address_delivery>${idAddress}</id_address_delivery>\n    <id_address_invoice>${idAddress}</id_address_invoice>\n    <id_shop>${ID_SHOP}</id_shop>\n    <id_currency>${ID_CURRENCY}</id_currency>\n    <id_lang>${ID_LANG}</id_lang>\n    <id_carrier>${idCarrier}</id_carrier>\n    <associations>\n      <cart_rows>\n${cartRowsXml}\n      </cart_rows>\n    </associations>\n  </cart>\n</prestashop>`

    const resultCart: any = await postXML('carts', xmlCart)
    let idCart = ''
    if (resultCart && ((resultCart.success && resultCart.id) || typeof resultCart === 'string' || typeof resultCart === 'number')) {
      idCart = resultCart.id ? resultCart.id : String(resultCart)
    } else {
      return { success: false, error: 'cart_creation_failed' }
    }

    // 4) calculer totaux
    const totalProducts = items.value.reduce((s, it) => s + it.price * it.quantity, 0)
    const totalProductsWT = totalProducts
    const totalShipping = 0
    const totalPaid = totalProductsWT + totalShipping

    // 5) prepare additional info required for a valid order
    // get customer secure_key
    let secureKey = ''
    try {
      const cust: any = await getOne('customers', idCustomer)
      secureKey = cust && cust.secure_key ? cust.secure_key : ''
    } catch {}

    // try to find a payment module (prefer cash on delivery)
    let idModule: number | string = 0
    if (options && options.forceModuleId) idModule = options.forceModuleId
    else if (forcedModuleLS) idModule = forcedModuleLS
    let paymentName = 'Paiement à la livraison'
    try {
      const moduleIds = await getAllIds('modules')
      for (const mid of moduleIds) {
        try {
          const m: any = await getOne('modules', mid)
          const name = (m.name || m.module_name || m.displayName || '').toString().toLowerCase()
          if (name.includes('cash') || name.includes('cashondelivery') || name.includes('paiement')) {
            idModule = mid
            paymentName = m.displayName || paymentName
            break
          }
        } catch {}
      }
      if (!idModule && moduleIds.length) idModule = moduleIds[0]
    } catch (e) { idModule = 0 }

    // 6) créer la commande (webservice-only) — inclut id_module, id_carrier, secure_key
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const xmlOrder = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop>\n  <order>\n    <id_customer>${idCustomer}</id_customer>\n    <id_cart>${idCart}</id_cart>\n    <id_address_delivery>${idAddress}</id_address_delivery>\n    <id_address_invoice>${idAddress}</id_address_invoice>\n    <id_shop>${ID_SHOP}</id_shop>\n    <id_currency>${ID_CURRENCY}</id_currency>\n    <id_lang>${ID_LANG}</id_lang>\n    <id_carrier>${idCarrier}</id_carrier>\n    <id_module>${idModule}</id_module>\n    <secure_key><![CDATA[${secureKey}]]></secure_key>\n    <current_state>2</current_state>\n    <total_paid>${totalPaid.toFixed(2)}</total_paid>\n    <total_paid_tax_incl>${totalPaid.toFixed(2)}</total_paid_tax_incl>\n    <total_paid_tax_excl>${totalProducts.toFixed(2)}</total_paid_tax_excl>\n    <total_products>${totalProducts.toFixed(2)}</total_products>\n    <total_products_wt>${totalProductsWT.toFixed(2)}</total_products_wt>\n    <total_shipping>${totalShipping.toFixed(2)}</total_shipping>\n    <conversion_rate>1</conversion_rate>\n    <date_add>${now}</date_add>\n    <payment><![CDATA[${paymentName}]]></payment>\n  </order>\n</prestashop>`

    const resultOrder: any = await postXML('orders', xmlOrder)
    let idOrder = ''
    if (resultOrder && ((resultOrder.success && resultOrder.id) || typeof resultOrder === 'string' || typeof resultOrder === 'number')) {
      idOrder = resultOrder.id ? resultOrder.id : String(resultOrder)
      // vider le panier local
      clear()
      return { success: true, orderId: idOrder }
    }

    return { success: false, error: 'order_creation_failed' }
  }

  return { items, addItem, removeItem, updateQuantity, clear, placeOrder }
})
