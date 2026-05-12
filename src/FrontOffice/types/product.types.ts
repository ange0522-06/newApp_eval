export interface Attribute{
    id:string
    name:string
    groupName:string
}

export interface Combination {
    id: string
    price: number
    stock: number
    attributes: Attribute[]
}

export interface Product {
    id: string;
    reference: string;
    name: string;
    price: number;
    priceTTC: number;
    taxRate: number;
    imageUrl: string;
    id_category_default: string
    category_ids: string[];  // Toutes les catégories auxquelles le produit appartient
    active: boolean;
}

export interface ProductDetail extends Product {
    description: string
    combinations: Combination[]
    hasCombinations: boolean   // true si le produit a des déclinaisons
}

export interface Category {
    id: string
    name: string
    parent_id?: string
}

// ─── État du chargement ──────────────────────────────────────────────────────
export type LoadingState = 'idle' | 'loading' | 'success' | 'error'