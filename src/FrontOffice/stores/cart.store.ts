import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getAllIds, getOne, postXML } from '@/shared/services/prestashop.service.js'

const ID_SHOP = 1
const ID_SHOP_GROUP = 1
const ID_CURRENCY = 1
const ID_LANG = 1
const DEFAULT_EMPLOYEE = 1
const ORDER_STATE_PAID = '2'
const CASH_ON_DELIVERY_MODULE = 'ps_cashondelivery'
const CASH_ON_DELIVERY_LABEL = 'Paiement a la livraison'
const FALLBACK_COUNTRY_ID = '8'

export interface CartItem {
  productId: string
  combinationId?: string
  name: string
  reference?: string
  imageUrl?: string
  price?: number
  priceHT?: number
  priceTTC?: number
  taxRate?: number
  stock?: number
  quantity: number
}

type CreatedResponse = { success?: boolean; id?: string | number; error?: string }

function xml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cdata(value: string | number): string {
  return `<![CDATA[${String(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function nowForPrestaShop(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function getItemPriceTTC(item: CartItem): number {
  return Number(item.priceTTC ?? item.price ?? 0)
}

function getItemPriceHT(item: CartItem): number {
  if (item.priceHT !== undefined) return Number(item.priceHT) || 0
  const taxRate = Number(item.taxRate ?? 0)
  const priceTTC = getItemPriceTTC(item)
  return taxRate > 0 ? priceTTC / (1 + taxRate) : priceTTC
}

function getCreatedId(result: CreatedResponse, label: string): string {
  if (result && result.success && result.id) return String(result.id)
  throw new Error(result?.error || `${label}_creation_failed`)
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  const stockError = ref('')

  const totalHT = computed(() =>
    items.value.reduce((sum, item) => sum + getItemPriceHT(item) * item.quantity, 0)
  )
  const totalTTC = computed(() =>
    items.value.reduce((sum, item) => sum + getItemPriceTTC(item) * item.quantity, 0)
  )
  const totalQuantity = computed(() =>
    items.value.reduce((sum, item) => sum + item.quantity, 0)
  )

  function clearLegacyStoredCart() {
    localStorage.removeItem('cart_items')
  }

  function getStockLimit(item: CartItem): number {
    return Number.isFinite(item.stock) ? Math.max(0, Number(item.stock)) : Number.POSITIVE_INFINITY
  }

  function findItem(productId: string, combinationId?: string): CartItem | undefined {
    return items.value.find(i =>
      i.productId === productId &&
      (i.combinationId || '') === (combinationId || '')
    )
  }

  function setStockError(message: string) {
    stockError.value = message
  }

  function clearStockError() {
    stockError.value = ''
  }

  function addItem(item: CartItem) {
    clearStockError()
    const existing = findItem(item.productId, item.combinationId)
    const stockLimit = getStockLimit(item)
    const requestedQuantity = Math.max(1, Math.floor(item.quantity || 1))
    const nextQuantity = (existing?.quantity || 0) + requestedQuantity

    if (nextQuantity > stockLimit) {
      const remainingStock = Math.max(0, stockLimit - (existing?.quantity || 0))
      setStockError(`Stock insuffisant pour ${item.name}. Stock restant: ${remainingStock}.`)
      return { success: false, error: stockError.value }
    }

    if (existing) {
      existing.quantity = nextQuantity
      existing.stock = item.stock
    } else {
      items.value.push({
        ...item,
        priceHT: item.priceHT ?? getItemPriceHT(item),
        priceTTC: item.priceTTC ?? getItemPriceTTC(item),
        quantity: requestedQuantity,
      })
    }

    return { success: true }
  }

  function removeItem(productId: string, combinationId?: string) {
    clearStockError()
    const key = combinationId || ''
    items.value = items.value.filter(i =>
      !(i.productId === productId && (i.combinationId || '') === key)
    )
  }

  function updateQuantity(productId: string, combinationId: string | undefined, qty: number) {
    clearStockError()
    const item = findItem(productId, combinationId)

    if (item) {
      const requestedQuantity = Math.max(1, Math.floor(qty || 1))
      const stockLimit = getStockLimit(item)

      if (requestedQuantity > stockLimit) {
        setStockError(`Stock insuffisant pour ${item.name}. Stock restant: ${stockLimit}.`)
        return { success: false, error: stockError.value }
      }

      item.quantity = requestedQuantity
      return { success: true }
    }

    return { success: false, error: 'Produit introuvable dans le panier.' }
  }

  function clear() {
    clearStockError()
    items.value = []
  }

  clearLegacyStoredCart()

  async function findCustomerIdByEmail(email: string): Promise<string | null> {
    const ids = await getAllIds('customers')
    const wantedEmail = normalize(email)

    for (const id of ids) {
      try {
        const data = (await getOne('customers', id)) as any
        if (normalize(data.email || '') === wantedEmail) return id
      } catch {
        continue
      }
    }

    return null
  }

  async function getDefaultCountryId(): Promise<string> {
    const forced = localStorage.getItem('forced_id_country')
    if (forced) return forced

    try {
      const ids = await getAllIds('countries')
      const countries = await Promise.allSettled(
        ids.map(async id => ({ id, data: (await getOne('countries', id)) as any }))
      )
      const activeCountries = countries
        .filter((result): result is PromiseFulfilledResult<{ id: string, data: any }> =>
          result.status === 'fulfilled'
        )
        .filter(result => result.value.data?.active === '1')
        .map(result => result.value)

      const preferred =
        activeCountries.find(country => country.data.iso_code === 'MG') ||
        activeCountries.find(country => country.data.iso_code === 'FR') ||
        activeCountries[0]

      return preferred?.id || FALLBACK_COUNTRY_ID
    } catch {
      return FALLBACK_COUNTRY_ID
    }
  }

  async function getDefaultCarrierId(): Promise<string> {
    const forced = localStorage.getItem('forced_id_carrier')
    if (forced) return forced

    const ids = await getAllIds('carriers')
    for (const id of ids) {
      try {
        const carrier = (await getOne('carriers', id)) as any
        if (carrier.active === '1' && carrier.deleted !== '1') return id
      } catch {
        continue
      }
    }

    return ids[0] || '1'
  }

  async function postRequired(resource: string, body: string, label: string): Promise<string> {
    const result = (await postXML(resource, body)) as CreatedResponse
    return getCreatedId(result, label)
  }

  function validateCartStock(): { success: boolean, error?: string } {
    clearStockError()
    for (const item of items.value) {
      const stockLimit = getStockLimit(item)
      if (item.quantity > stockLimit) {
        setStockError(`Stock insuffisant pour ${item.name}. Stock restant: ${stockLimit}.`)
        return { success: false, error: stockError.value }
      }
    }
    return { success: true }
  }

  async function placeOrder(
    address: { firstname: string, lastname: string, address1: string, city: string, postcode: string, phone?: string },
    options?: { forceCarrierId?: string | number }
  ) {
    if (items.value.length === 0) return { success: false, error: 'empty_cart' }
    const stockCheck = validateCartStock()
    if (!stockCheck.success) return stockCheck

    const isCustomerAuthenticated =
      localStorage.getItem('auth_authenticated') === 'true' &&
      localStorage.getItem('auth_email') !== null &&
      localStorage.getItem('auth_token') !== null
    if (!isCustomerAuthenticated || localStorage.getItem('auth_is_anonymous') === 'true') {
      return { success: false, error: 'existing_customer_required' }
    }

    const email = localStorage.getItem('auth_email') || `anonymous-${Date.now()}@newapp.local`

    let idCustomer = localStorage.getItem('auth_customer_id')
    if (!idCustomer || idCustomer === 'anonymous') {
      idCustomer = await findCustomerIdByEmail(email)
    }
    if (!idCustomer) return { success: false, error: 'customer_not_found' }

    let secureKey = ''
    try {
      const customer = (await getOne('customers', idCustomer)) as any
      secureKey = customer?.secure_key || ''
    } catch {}

    const createdAt = nowForPrestaShop()
    const idCountry = await getDefaultCountryId()
    const xmlAddress = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${idCustomer}</id_customer>
    <id_country>${xml(idCountry)}</id_country>
    <alias>${cdata('Adresse commande')}</alias>
    <firstname>${cdata(address.firstname)}</firstname>
    <lastname>${cdata(address.lastname)}</lastname>
    <address1>${cdata(address.address1)}</address1>
    <city>${cdata(address.city)}</city>
    <postcode>${cdata(address.postcode)}</postcode>
    <phone>${cdata(address.phone || '')}</phone>
    <deleted>0</deleted>
    <active>1</active>
    <date_add>${createdAt}</date_add>
    <date_upd>${createdAt}</date_upd>
  </address>
</prestashop>`

    let idAddress = ''
    try {
      idAddress = await postRequired('addresses', xmlAddress, 'address')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'address_creation_failed' }
    }

    let idCarrier: string | number = options?.forceCarrierId || ''
    if (!idCarrier) idCarrier = await getDefaultCarrierId()

    const cartRowsXml = items.value.map(item => {
      const idProductAttribute = item.combinationId || 0
      return `
      <cart_row>
        <id_product>${item.productId}</id_product>
        <id_product_attribute>${idProductAttribute}</id_product_attribute>
        <id_address_delivery>${idAddress}</id_address_delivery>
        <id_customization>0</id_customization>
        <quantity>${item.quantity}</quantity>
      </cart_row>`
    }).join('')

    const xmlCart = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_address_delivery>${idAddress}</id_address_delivery>
    <id_address_invoice>${idAddress}</id_address_invoice>
    <id_currency>${ID_CURRENCY}</id_currency>
    <id_customer>${idCustomer}</id_customer>
    <id_guest>0</id_guest>
    <id_lang>${ID_LANG}</id_lang>
    <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
    <id_shop>${ID_SHOP}</id_shop>
    <id_carrier>${idCarrier}</id_carrier>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <mobile_theme>0</mobile_theme>
    <delivery_option></delivery_option>
    <secure_key>${xml(secureKey)}</secure_key>
    <allow_seperated_package>0</allow_seperated_package>
    <date_add>${createdAt}</date_add>
    <date_upd>${createdAt}</date_upd>
    <associations>
      <cart_rows>${cartRowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`

    let idCart = ''
    try {
      idCart = await postRequired('carts', xmlCart, 'cart')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'cart_creation_failed' }
    }

    const totalProducts = totalHT.value
    const totalProductsWT = totalTTC.value
    const totalShipping = 0
    const totalPaid = totalProductsWT + totalShipping

    const orderRowsXml = items.value.map(item => {
      const idProductAttribute = item.combinationId || 0
      const unitHT = getItemPriceHT(item)
      const unitTTC = getItemPriceTTC(item)
      return `
      <order_row>
        <product_id>${item.productId}</product_id>
        <product_attribute_id>${idProductAttribute}</product_attribute_id>
        <product_quantity>${item.quantity}</product_quantity>
        <product_name>${cdata(item.name)}</product_name>
        <product_reference>${cdata(item.reference || '')}</product_reference>
        <product_price>${unitHT.toFixed(6)}</product_price>
        <unit_price_tax_incl>${unitTTC.toFixed(6)}</unit_price_tax_incl>
        <unit_price_tax_excl>${unitHT.toFixed(6)}</unit_price_tax_excl>
      </order_row>`
    }).join('')

    const xmlOrder = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_address_delivery>${idAddress}</id_address_delivery>
    <id_address_invoice>${idAddress}</id_address_invoice>
    <id_cart>${idCart}</id_cart>
    <id_currency>${ID_CURRENCY}</id_currency>
    <id_lang>${ID_LANG}</id_lang>
    <id_shop>${ID_SHOP}</id_shop>
    <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
    <module>${CASH_ON_DELIVERY_MODULE}</module>
    <payment>${cdata(CASH_ON_DELIVERY_LABEL)}</payment>
    <id_customer>${idCustomer}</id_customer>
    <id_carrier>${idCarrier}</id_carrier>
    <current_state>${ORDER_STATE_PAID}</current_state>
    <secure_key>${xml(secureKey)}</secure_key>
    <total_discounts>0.000000</total_discounts>
    <total_discounts_tax_incl>0.000000</total_discounts_tax_incl>
    <total_discounts_tax_excl>0.000000</total_discounts_tax_excl>
    <total_paid>${totalPaid.toFixed(6)}</total_paid>
    <total_paid_tax_incl>${totalPaid.toFixed(6)}</total_paid_tax_incl>
    <total_paid_tax_excl>${totalProducts.toFixed(6)}</total_paid_tax_excl>
    <total_paid_real>${totalPaid.toFixed(6)}</total_paid_real>
    <total_products>${totalProducts.toFixed(6)}</total_products>
    <total_products_wt>${totalProductsWT.toFixed(6)}</total_products_wt>
    <total_shipping>${totalShipping.toFixed(6)}</total_shipping>
    <total_shipping_tax_incl>${totalShipping.toFixed(6)}</total_shipping_tax_incl>
    <total_shipping_tax_excl>${totalShipping.toFixed(6)}</total_shipping_tax_excl>
    <carrier_tax_rate>0.000000</carrier_tax_rate>
    <total_wrapping>0.000000</total_wrapping>
    <total_wrapping_tax_incl>0.000000</total_wrapping_tax_incl>
    <total_wrapping_tax_excl>0.000000</total_wrapping_tax_excl>
    <conversion_rate>1.000000</conversion_rate>
    <valid>1</valid>
    <date_add>${createdAt}</date_add>
    <date_upd>${createdAt}</date_upd>
    <associations>
      <order_rows>${orderRowsXml}
      </order_rows>
    </associations>
  </order>
</prestashop>`

    try {
      const idOrder = await postRequired('orders', xmlOrder, 'order')

      const xmlOrderHistory = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_employee>${DEFAULT_EMPLOYEE}</id_employee>
    <id_order_state>${ORDER_STATE_PAID}</id_order_state>
    <id_order>${idOrder}</id_order>
    <date_add>${createdAt}</date_add>
  </order_history>
</prestashop>`

      await postXML('order_histories', xmlOrderHistory)
      clear()
      return { success: true, orderId: idOrder }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'order_creation_failed' }
    }
  }

  return {
    items,
    stockError,
    totalHT,
    totalTTC,
    totalQuantity,
    validateCartStock,
    addItem,
    removeItem,
    updateQuantity,
    clear,
    placeOrder,
  }
})
