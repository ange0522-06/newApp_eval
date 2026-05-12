import {
  getAllIds,
  getOne,
  deleteResource,
  putXML
} from '../../shared/services/prestashop.service.js';

/**
 * Service de réinitialisation des données PrestaShop
 * Utilise UNIQUEMENT les fonctions XML du prestashop.service.js
 * 
 * Respecte l'ordre strict de suppression pour éviter les erreurs de clés étrangères:
 * 1. order_histories
 * 2. order_details
 * 3. orders
 * 4. carts
 * 5. addresses
 * 6. customers
 * 7. stock_availables (putXML quantity=0)
 * 8. combinations
 * 9. products
 * 10. categories (avec vérifications spéciales)
 * 11. taxes
 * 12. tax_rule_groups
 */

/**
 * Supprimer toutes les ressources d'un type
 */
async function deleteAll(resource: string): Promise<void> {
  try {
    const ids = await getAllIds(resource);
    console.log(`Suppression de ${resource}: ${ids.length} éléments`);

    for (const id of ids) {
      try {
        await deleteResource(resource, id);
        console.log(`✓ ${resource}/${id} supprimé`);
      } catch (error) {
        console.warn(`✗ Erreur suppression ${resource}/${id}:`, error);
        // Continuer même si erreur
      }
    }
  } catch (error) {
    console.warn(`✗ Erreur lors de la suppression de ${resource}:`, error);
  }
}

/**
 * Reset stock à 0 (ne pas supprimer, juste mettre quantity=0)
 */
async function resetStock(): Promise<void> {
  try {
    const ids = await getAllIds('stock_availables');
    console.log(`Reset stock: ${ids.length} éléments`);

    for (const id of ids) {
      try {
        const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_available>
    <id>${id}</id>
    <quantity>0</quantity>
  </stock_available>
</prestashop>`;
        
        await putXML('stock_availables', id, xmlBody);
        console.log(`✓ stock_available/${id} remis à 0`);
      } catch (error) {
        console.warn(`✗ Erreur reset stock/${id}:`, error);
        // Continuer même si erreur
      }
    }
  } catch (error) {
    console.warn(`✗ Erreur lors du reset des stocks:`, error);
  }
}

/**
 * Vérifier si une catégorie peut être supprimée
 * Ne jamais supprimer:
 * - id = 1 (Racine)
 * - id = 2 (Accueil)
 * - Toute catégorie dont id_parent = 1 ou 2
 */
async function isCategoryDeletable(id: string): Promise<boolean> {
  try {
    // Les catégories 1 et 2 ne sont jamais supprimées
    if (id === '1' || id === '2') {
      console.log(`Catégorie ${id} protégée (Racine/Accueil)`);
      return false;
    }

    // Vérifier le parent de la catégorie
    const categoryData = await getOne('categories', id) as any;
    const idParent = categoryData.id_parent || '';
    
    if (idParent === '1' || idParent === '2') {
      console.log(`Catégorie ${id} protégée (parent = ${idParent})`);
      return false;
    }

    console.log(`Catégorie ${id} peut être supprimée (parent = ${idParent})`);
    return true;
  } catch (error) {
    console.warn(`✗ Erreur vérification catégorie ${id}:`, error);
    return false; // Par prudence, ne pas supprimer si erreur
  }
}

/**
 * Supprimer les catégories importées uniquement
 */
async function resetCategories(): Promise<void> {
  try {
    const ids = await getAllIds('categories');
    console.log(`Suppression catégories: ${ids.length} éléments`);

    for (const id of ids) {
      try {
        const isDeletable = await isCategoryDeletable(id);
        if (isDeletable) {
          await deleteResource('categories', id);
          console.log(`✓ categories/${id} supprimée`);
        } else {
          console.log(`⊘ categories/${id} protégée, non supprimée`);
        }
      } catch (error) {
        console.warn(`✗ Erreur suppression categories/${id}:`, error);
        // Continuer même si erreur
      }
    }
  } catch (error) {
    console.warn(`✗ Erreur lors de la suppression des catégories:`, error);
  }
}

/**
 * Réinitialisation complète: supprime toutes les données importées
 * Respecte l'ordre strict de suppression
 */
export async function resetAll(): Promise<void> {
  console.log('🔄 Début de la réinitialisation complète');

  const steps = [
    { name: 'Historiques de commandes', resource: 'order_histories' },
    { name: 'Détails de commandes', resource: 'order_details' },
    { name: 'Commandes', resource: 'orders' },
    { name: 'Paniers', resource: 'carts' },
    { name: 'Adresses', resource: 'addresses' },
    { name: 'Clients', resource: 'customers' },
    { name: 'Combinaisons', resource: 'combinations' },
    { name: 'Produits', resource: 'products' },
    { name: 'Taxes', resource: 'taxes' },
    { name: 'Groupes de taxes', resource: 'tax_rule_groups' },
  ];

  // Étapes 1-9 et 11-12 : suppression normale
  for (const step of steps) {
    console.log(`\n📦 Étape: ${step.name}...`);
    try {
      await deleteAll(step.resource);
    } catch (error) {
      console.warn(`⚠ Erreur étape "${step.name}":`, error);
      // Ne pas bloquer les étapes suivantes
    }
  }

  // Étape 10 : Reset stock (quantity = 0)
  console.log(`\n📦 Étape: Stocks...`);
  try {
    await resetStock();
  } catch (error) {
    console.warn(`⚠ Erreur étape "Stocks":`, error);
  }

  // Étape 11 : Suppression des catégories (avec vérifications)
  console.log(`\n📦 Étape: Catégories...`);
  try {
    await resetCategories();
  } catch (error) {
    console.warn(`⚠ Erreur étape "Catégories":`, error);
  }

  console.log('\n✅ Réinitialisation terminée');
}
