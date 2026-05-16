export interface Attribute {
  id: string
  name: string
  groupName: string
}

export interface Combination {
  id: string
  price: number
  stock: number
  attributes: Attribute[]
}

export interface Product {
  id: string
  reference: string
  name: string
  price: number
  priceTTC: number
  taxRate: number
  imageUrl: string
  id_category_default: string
  category_ids: string[]
  availableDate: string
  releaseBadge?: 'HOT' | 'NEW'
  active: boolean
}

export interface ProductDetail extends Product {
  description: string
  combinations: Combination[]
  hasCombinations: boolean
  stock: number
}

export interface Category {
  id: string
  name: string
  parent_id?: string
}

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'
