<template>
  <div class="product-view">

    <!-- Bouton retour -->
    <button class="btn-back" @click="goBack">← Retour</button>

    <!-- État : chargement -->
    <div v-if="loadingState === 'loading'">
      Chargement du produit...
    </div>

    <!-- État : erreur -->
    <div v-else-if="loadingState === 'error'">
      Erreur lors du chargement du produit.
    </div>

    <!-- État : succès -->
    <div v-else-if="loadingState === 'success' && product" class="product-detail">

      <!-- Image -->
      <div class="product-detail__image-wrapper">
        <img
          :src="product.imageUrl"
          :alt="product.name"
          class="product-detail__image"
          @error="onImageError"
        />
      </div>

      <!-- Informations -->
      <div class="product-detail__info">

        <!-- Nom et référence -->
        <span
          v-if="product.releaseBadge"
          :class="['product-detail__badge', `product-detail__badge--${product.releaseBadge.toLowerCase()}`]"
        >
          {{ product.releaseBadge }}
        </span>
        <h1 class="product-detail__name">{{ product.name }}</h1>
        <p class="product-detail__reference">Réf : {{ product.reference }}</p>

        <!-- Prix -->
        <p class="product-detail__price">{{ formatPrice(selectedPrice) }}</p>

        <!-- Description -->
        <p v-if="product.description" class="product-detail__description">
          {{ product.description }}
        </p>

        <!-- Déclinaisons -->
        <div v-if="product.hasCombinations" class="product-detail__combinations">

          <!-- Grouper les déclinaisons par attribut (taille, couleur...) -->
          <div
            v-for="(values, groupName) in groupedAttributes"
            :key="groupName"
            class="product-detail__attribute-group"
          >
            <!-- Nom du groupe ex: "Taille" -->
            <p class="product-detail__attribute-label">{{ groupName }} :</p>

            <!-- Boutons de sélection pour chaque valeur -->
            <div class="product-detail__attribute-values">
              <button
                v-for="value in values"
                :key="value.attributeId"
                class="btn-attribute"
                :class="{ 'btn-attribute--selected': selectedAttributeIds.includes(value.attributeId) }"
                @click="selectAttribute(groupName, value.attributeId)"
              >
                {{ value.name }}
              </button>
            </div>
          </div>
        </div>

        <!-- Stock disponible -->
        <p class="product-detail__stock">
          Stock disponible : {{ currentStock }}
        </p>
        <p v-if="cartError" class="product-detail__error">
          {{ cartError }}
        </p>

        <!-- Quantité -->
        <div class="product-detail__quantity">
          <label>Quantité :</label>
          <input
            type="number"
            v-model.number="quantity"
            :min="1"
            :max="currentStock"
            class="input-quantity"
          />
        </div>

        <!-- Bouton ajouter au panier -->
        <div class="product-actions">
          <button
            class="btn-cart"
            :disabled="currentStock === 0 || quantity > currentStock"
            @click="addToCart"
          >
            {{ currentStock === 0 ? 'Rupture de stock' : 'Ajouter au panier' }}
          </button>

          <!-- Bouton continuer l'achat (ajoute et retourne à l'accueil) -->
          <button
            class="btn-continue"
            :disabled="currentStock === 0 || quantity > currentStock"
            @click="continueShopping"
          >
            Continuer l'achat
          </button>
        </div>

        <!-- Message confirmation ajout panier -->
        <p v-if="addedToCart" class="product-detail__confirmation">
          ✅ Produit ajouté au panier
        </p>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProductById } from '../services/product.service'
import type { ProductDetail, Combination, LoadingState } from '@/FrontOffice/types/product.types'
import { useCartStore } from '../stores/cart.store'

// ─── Route et Router ─────────────────────────────────────────────────────────

/**
 * useRoute() = accès aux paramètres de l'URL
 * /product/:id → route.params.id contient l'id du produit
 */
const route = useRoute()

/**
 * useRouter() = navigation entre les pages
 */
const router = useRouter()

// ─── État ────────────────────────────────────────────────────────────────────

/**
 * Produit chargé depuis l'API
 * null au départ, rempli après l'appel API
 */
const product = ref<ProductDetail | null>(null)

/**
 * État du chargement
 */
const loadingState = ref<LoadingState>('idle')

/**
 * Quantité choisie par l'utilisateur
 */
const quantity = ref<number>(1)

/**
 * IDs des attributs sélectionnés par l'utilisateur
 * ex: ['3', '7'] = taille ngoza + couleur mainty
 */
const selectedAttributeIds = ref<string[]>([])

/**
 * true si le produit vient d'être ajouté au panier
 * Sert à afficher le message de confirmation
 */
const addedToCart = ref<boolean>(false)
const cartError = ref('')

// ─── Computed ─────────────────────────────────────────────────────────────────

/**
 * Trouve la combinaison correspondant aux attributs sélectionnés
 * Retourne null si aucune combinaison ne correspond
 * computed() = se recalcule automatiquement quand selectedAttributeIds change
 */
const selectedCombination = computed<Combination | null>(() => {
  if (!product.value || !product.value.hasCombinations) return null

  return product.value.combinations.find(combination =>
    combination.attributes.every(attr =>
      selectedAttributeIds.value.includes(attr.id)
    )
  ) ?? null
})

/**
 * Prix affiché selon la combinaison sélectionnée
 * Si déclinaison sélectionnée → prix de la déclinaison
 * Sinon → prix de base du produit
 */
const selectedPrice = computed<number>(() => {
  if (selectedCombination.value) {
    return selectedCombination.value.price
  }
  return product.value?.priceTTC ?? 0
})

/**
 * Stock disponible selon la combinaison sélectionnée
 * Si déclinaison sélectionnée → stock de la déclinaison
 * Sinon → 0 (forcer la sélection d'une déclinaison)
 */
const currentStock = computed<number>(() => {
  if (!product.value) return 0
  if (!product.value.hasCombinations) return product.value.stock
  if (selectedCombination.value) {
    return selectedCombination.value.stock
  }
  return 0
})

/**
 * Groupe les attributs par nom de groupe pour l'affichage
 * Transforme le tableau de combinations en objet groupé :
 * {
 *   "taille": [{ attributeId: '1', name: 'ngoza' }, { attributeId: '2', name: 'kely' }],
 *   "couleur": [{ attributeId: '3', name: 'mainty' }, { attributeId: '4', name: 'fotsy' }]
 * }
 */
const groupedAttributes = computed<Record<string, { attributeId: string, name: string }[]>>(() => {
  if (!product.value?.hasCombinations) return {}

  const groups: Record<string, { attributeId: string, name: string }[]> = {}

  for (const combination of product.value.combinations) {
    for (const attr of combination.attributes) {
      if (!groups[attr.groupName]) {
        groups[attr.groupName] = []
      }
      // Eviter les doublons
      const exists = groups[attr.groupName].some(v => v.attributeId === attr.id)
      if (!exists) {
        groups[attr.groupName].push({
          attributeId: attr.id,
          name: attr.name
        })
      }
    }
  }

  return groups
})

// ─── Fonctions ───────────────────────────────────────────────────────────────

/**
 * Charge le produit depuis l'API via son ID
 */
async function loadProduct(): Promise<void> {
  loadingState.value = 'loading'
  try {
    // Récupérer l'id depuis l'URL /product/:id
    const id = route.params.id as string
    product.value = await getProductById(id)
    loadingState.value = 'success'
  } catch (error) {
    console.error('Erreur loadProduct:', error)
    loadingState.value = 'error'
  }
}

/**
 * Sélectionne un attribut dans un groupe
 * Un seul attribut par groupe peut être sélectionné à la fois
 * ex: si on choisit "kely" dans "taille", "ngoza" est désélectionné
 */
function selectAttribute(groupName: string, attributeId: string): void {
  if (!product.value) return

  // Trouver tous les IDs d'attributs du même groupe
  const groupAttributeIds = (groupedAttributes.value[groupName] ?? [])
    .map(v => v.attributeId)

  // Retirer les attributs du même groupe de la sélection
  selectedAttributeIds.value = selectedAttributeIds.value
    .filter(id => !groupAttributeIds.includes(id))

  // Ajouter le nouvel attribut sélectionné
  selectedAttributeIds.value.push(attributeId)
}

/**
 * Ajoute le produit au panier
 * Pour l'instant : log dans la console
 * À remplacer par cartStore.addItem() quand le store panier sera créé
 */
function buildCartItem() {
  if (!product.value) return
  if (quantity.value < 1) {
    cartError.value = 'La quantite doit etre au moins egale a 1.'
    return
  }
  if (quantity.value > currentStock.value) {
    cartError.value = `Stock insuffisant. Stock restant: ${currentStock.value}.`
    return
  }

  const priceTTC = selectedCombination.value ? selectedCombination.value.price : product.value.priceTTC
  const priceHT = product.value.taxRate > 0 ? priceTTC / (1 + product.value.taxRate) : product.value.price

  return {
    productId: product.value.id,
    combinationId: selectedCombination.value?.id,
    name: product.value.name,
    reference: product.value.reference,
    imageUrl: product.value.imageUrl,
    priceHT,
    priceTTC,
    taxRate: product.value.taxRate,
    stock: currentStock.value,
    quantity: quantity.value
  }
}

function addToCart(): void {
  cartError.value = ''
  if (!product.value) return
  if (currentStock.value === 0) return

  const cart = useCartStore()
  const item = buildCartItem()
  if (!item) return

  const result = cart.addItem(item)
  if (!result.success) {
    cartError.value = result.error || 'Stock insuffisant.'
    return
  }

  // Afficher la confirmation pendant 2 secondes
  addedToCart.value = true
  setTimeout(() => {
    addedToCart.value = false
  }, 2000)
}

function continueShopping(): void {
  cartError.value = ''
  if (!product.value) return
  if (currentStock.value === 0) return

  const cart = useCartStore()
  const item = buildCartItem()
  if (!item) return

  const result = cart.addItem(item)
  if (!result.success) {
    cartError.value = result.error || 'Stock insuffisant.'
    return
  }
  // retourner à la liste produits / home pour continuer les achats
  router.push('/home')
}

/**
 * Formate le prix en euros
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(price)
}

/**
 * Gère l'erreur si l'image ne charge pas
 */
function onImageError(event: Event): void {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder.png'
}

/**
 * Retourne à la page d'accueil FrontOffice
 */
function goBack(): void {
  router.push('/home')
}

// ─── Cycle de vie ────────────────────────────────────────────────────────────

onMounted(() => {
  loadProduct()
})
</script>

<style scoped>
.product-view {
  padding: 1rem;
  max-width: 900px;
  margin: 0 auto;
}

.btn-back {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #2a7ae2;
  margin-bottom: 1rem;
  padding: 0;
}

.product-detail {
  display: flex;
  gap: 2rem;
}

.product-detail__image-wrapper {
  flex: 1;
}

.product-detail__image {
  width: 100%;
  border-radius: 8px;
  object-fit: cover;
  background: #f5f5f5;
}

.product-detail__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.product-detail__name {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}

.product-detail__badge {
  align-self: flex-start;
  border-radius: 999px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.25rem 0.6rem;
}

.product-detail__badge--hot {
  background: #dc2626;
}

.product-detail__badge--new {
  background: #2563eb;
}

.product-detail__reference {
  color: #888;
  font-size: 0.85rem;
  margin: 0;
}

.product-detail__price {
  font-size: 1.4rem;
  font-weight: 700;
  color: #2a7ae2;
  margin: 0;
}

.product-detail__description {
  color: #444;
  font-size: 0.95rem;
  margin: 0;
}

.product-detail__attribute-label {
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  text-transform: capitalize;
}

.product-detail__attribute-values {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-attribute {
  padding: 0.4rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  background: white;
  font-size: 0.9rem;
}

.btn-attribute--selected {
  border-color: #2a7ae2;
  background: #2a7ae2;
  color: white;
}

.product-detail__stock {
  font-size: 0.9rem;
  color: #555;
  margin: 0;
}

.product-detail__quantity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-quantity {
  width: 60px;
  padding: 0.3rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.btn-cart {
  padding: 0.75rem;
  background: #2a7ae2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
}

.btn-cart:disabled {
  background: #aaa;
  cursor: not-allowed;
}

.product-detail__confirmation {
  color: green;
  font-size: 0.9rem;
  margin: 0;
}

.product-detail__error {
  color: #c0392b;
  font-size: 0.9rem;
  margin: 0;
}
</style>
