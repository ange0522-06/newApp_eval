import { getAllIds, getOne } from '@/shared/services/prestashop.service.js'

export type CustomerOption = {
  id: string
  firstname: string
  lastname: string
  email: string
  active: boolean
}

type RawCustomer = Record<string, string | undefined>

function normalizeCustomer(id: string, raw: RawCustomer): CustomerOption | null {
  const email = raw.email?.trim()

  if (!email) {
    return null
  }

  return {
    id,
    firstname: raw.firstname?.trim() || 'Client',
    lastname: raw.lastname?.trim() || '',
    email,
    active: raw.active !== '0',
  }
}

export async function getAllCustomers(): Promise<CustomerOption[]> {
  const ids = await getAllIds('customers')
  const customers = await Promise.all(
    ids.map(async (id) => {
      try {
        const raw = await getOne('customers', id) as unknown as RawCustomer
        return normalizeCustomer(id, raw)
      } catch (error) {
        console.warn(`Client ${id} ignore:`, error)
        return null
      }
    })
  )

  return customers
    .filter((customer): customer is CustomerOption => customer !== null)
    .sort((a, b) => {
      const nameA = `${a.firstname} ${a.lastname}`.trim().toLowerCase()
      const nameB = `${b.firstname} ${b.lastname}`.trim().toLowerCase()
      return nameA.localeCompare(nameB)
    })
}

export function authenticateCustomer(customer: CustomerOption): void {
  localStorage.setItem('auth_authenticated', 'true')
  localStorage.setItem('auth_email', customer.email)
  localStorage.setItem('auth_token', `${customer.id}-${Date.now()}`)
  localStorage.setItem('auth_customer_id', customer.id)
  localStorage.setItem('auth_customer_name', `${customer.firstname} ${customer.lastname}`.trim())
  localStorage.removeItem('auth_is_anonymous')
}

export function authenticateAnonymousCustomer(): void {
  localStorage.setItem('auth_authenticated', 'true')
  localStorage.setItem('auth_email', `anonymous-${Date.now()}@newapp.local`)
  localStorage.setItem('auth_token', `anonymous-${Date.now()}`)
  localStorage.setItem('auth_customer_id', 'anonymous')
  localStorage.setItem('auth_customer_name', 'Utilisateur anonyme')
  localStorage.setItem('auth_is_anonymous', 'true')
}

export function clearCustomerSession(): void {
  localStorage.removeItem('auth_authenticated')
  localStorage.removeItem('auth_email')
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_customer_id')
  localStorage.removeItem('auth_customer_name')
  localStorage.removeItem('auth_is_anonymous')
}
