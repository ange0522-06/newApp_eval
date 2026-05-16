import { getAllIds, getOne } from '@/shared/services/prestashop.service.js'
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

export type DashboardStats = {
  days: DashboardDayRow[]
  states: DashboardStateRow[]
  totalOrders: number
  totalAmount: number
  pendingCarts: number
}

const STATE_LABELS: Record<string, string> = {
  cart: 'Dans le panier',
  '13': 'Paiement a la livraison',
  '2': 'Paiement effectue',
  '6': 'Annule',
}

function toAmount(order: Order): number {
  const total = parseFloat(order.total_paid || '0') || 0
  const rate = parseFloat(order.conversion_rate || '1') || 1
  return rate !== 0 ? total / rate : total
}

function toDay(dateValue: string): string {
  if (!dateValue) return 'Sans date'
  return dateValue.slice(0, 10)
}

async function countPendingCarts(orderCartIds: Set<string>): Promise<number> {
  try {
    const cartIds = await getAllIds('carts')
    let count = 0

    for (const cartId of cartIds) {
      if (orderCartIds.has(cartId)) continue

      try {
        const cart = await getOne('carts', cartId) as any
        if (cart?.id_customer) count += 1
      } catch {
        continue
      }
    }

    return count
  } catch {
    return 0
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const orders = await getAllOrders()
  const dayMap = new Map<string, DashboardDayRow>()
  const stateMap = new Map<string, DashboardStateRow>()
  const orderCartIds = new Set(orders.map(order => order.id_cart).filter(Boolean))

  for (const order of orders) {
    const amount = toAmount(order)
    const day = toDay(order.date_add)
    const dayRow = dayMap.get(day) || { date: day, count: 0, amount: 0 }
    dayRow.count += 1
    dayRow.amount += amount
    dayMap.set(day, dayRow)

    const stateId = order.current_state || '13'
    const stateRow = stateMap.get(stateId) || {
      id: stateId,
      label: STATE_LABELS[stateId] || order.stateName || `Etat ${stateId}`,
      count: 0,
      amount: 0,
    }
    stateRow.count += 1
    stateRow.amount += amount
    stateMap.set(stateId, stateRow)
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

  return {
    days: Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
    states: Array.from(stateMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    totalOrders: orders.length,
    totalAmount: orders.reduce((sum, order) => sum + toAmount(order), 0),
    pendingCarts,
  }
}
