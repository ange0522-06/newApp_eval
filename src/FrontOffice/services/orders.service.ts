import { getFullResource } from '@/shared/services/prestashop.service.js'

export type CustomerOrder = {
  id: string
  reference: string
  date_add: string
  current_state: string
  stateName: string
  total_paid: number
}

const STATE_NAMES: Record<string, string> = {
  '1': 'Dans le panier',
  '2': 'Paiement effectue',
  '5': 'Livre',
  '6': 'Annule',
  '13': 'Paiement a la livraison',
}

export async function getMyOrders(): Promise<CustomerOrder[]> {
  const customerId = localStorage.getItem('auth_customer_id')
  if (!customerId || customerId === 'anonymous') return []

  const rows = await getFullResource(
    'orders',
    '[id,reference,date_add,current_state,id_customer,total_paid,conversion_rate]'
  )

  return (rows as any[])
    .filter((order) => order.id_customer === customerId)
    .map((order) => {
      const rate = parseFloat(order.conversion_rate || '1') || 1
      const total = parseFloat(order.total_paid || '0') || 0
      return {
        id: order.id || '',
        reference: order.reference || '',
        date_add: order.date_add || '',
        current_state: order.current_state || '',
        stateName: STATE_NAMES[order.current_state] || `Etat #${order.current_state || '-'}`,
        total_paid: rate !== 0 ? total / rate : total,
      }
    })
    .sort((a, b) => b.date_add.localeCompare(a.date_add))
}
