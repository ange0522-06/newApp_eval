/**
 * Gestionnaire de transactions pour les imports
 * Implémente la règle "tout ou rien"
 * 
 * Suivi des ressources créées:
 * - Si une étape échoue → supprimer les ressources créées dans les étapes précédentes
 * - Chaque fichier = étape
 */

import { deleteResource } from '../../shared/services/prestashop.service.js';

export interface TransactionStep {
  name: string;
  resources: { resource: string; id: string }[];
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

export class ImportTransaction {
  private steps: Map<string, TransactionStep> = new Map();
  private stepOrder: string[] = [];

  /**
   * Enregistre une nouvelle étape (ex: "fichier1", "fichier2")
   */
  registerStep(stepName: string): void {
    if (!this.steps.has(stepName)) {
      this.steps.set(stepName, {
        name: stepName,
        resources: [],
        status: 'pending',
      });
      this.stepOrder.push(stepName);
      console.log(`📋 Étape enregistrée: ${stepName}`);
    }
  }

  /**
   * Ajoute une ressource créée à l'étape actuelle
   */
  trackResource(stepName: string, resource: string, id: string): void {
    const step = this.steps.get(stepName);
    if (!step) {
      console.warn(`⚠️ Étape ${stepName} non trouvée`);
      return;
    }

    step.resources.push({ resource, id });
    console.log(`📦 Ressource tracée: ${stepName} → ${resource}/${id}`);
  }

  /**
   * Marque une étape comme réussie
   */
  markStepSuccess(stepName: string): void {
    const step = this.steps.get(stepName);
    if (step) {
      step.status = 'success';
      console.log(`✅ Étape réussie: ${stepName} (${step.resources.length} ressources)`);
    }
  }

  /**
   * Marque une étape comme échouée et déclenche le rollback
   */
  async markStepFailed(stepName: string, error: string): Promise<void> {
    const step = this.steps.get(stepName);
    if (step) {
      step.status = 'failed';
      step.error = error;
      console.error(`❌ Étape échouée: ${stepName}`);
      console.error(`   Erreur: ${error}`);
    }

    // Rollback de TOUTES les étapes réussies
    await this.rollback();
  }

  /**
   * Supprime TOUTES les ressources créées (rollback complet)
   * Les supprime dans l'ordre inverse de création
   */
  async rollback(): Promise<void> {
    console.log('\n🔄 ROLLBACK TRANSACTIONNEL...\n');

    // Parcourir les étapes en ordre INVERSE (LIFO)
    for (let i = this.stepOrder.length - 1; i >= 0; i--) {
      const stepName = this.stepOrder[i];
      const step = this.steps.get(stepName);

      if (!step || step.resources.length === 0) {
        continue;
      }

      console.log(`🗑️  Suppression ressources de ${stepName}...`);

      // Supprimer les ressources en ordre inverse (LIFO)
      for (let j = step.resources.length - 1; j >= 0; j--) {
        const { resource, id } = step.resources[j];
        try {
          const success = await deleteResource(resource, id);
          if (success) {
            console.log(`   ✓ Supprimé: ${resource}/${id}`);
          } else {
            console.warn(`   ✗ Échec suppression: ${resource}/${id}`);
          }
        } catch (error) {
          console.error(`   ✗ Erreur suppression ${resource}/${id}:`, error);
        }
      }
    }

    console.log('\n✅ Rollback transactionnel complété\n');
  }

  /**
   * Retourne le statut global de la transaction
   */
  getStatus(): {
    steps: TransactionStep[];
    allSuccess: boolean;
    totalResourcesCreated: number;
  } {
    const steps = this.stepOrder.map((name) => this.steps.get(name)!);
    const allSuccess = steps.every((s) => s.status !== 'failed');
    const totalResourcesCreated = steps.reduce((sum, s) => sum + s.resources.length, 0);

    return {
      steps,
      allSuccess,
      totalResourcesCreated,
    };
  }

  /**
   * Récupère les ressources créées par une étape
   */
  getStepResources(stepName: string): { resource: string; id: string }[] {
    const step = this.steps.get(stepName);
    return step?.resources || [];
  }

  /**
   * Log le rapport final de la transaction
   */
  logReport(): void {
    const status = this.getStatus();
    
    console.log('\n📊 RAPPORT IMPORT\n');
    console.log(`Total ressources créées: ${status.totalResourcesCreated}`);
    console.log(`Status général: ${status.allSuccess ? '✅ SUCCÈS' : '❌ ÉCHEC (ROLLBACK)'}\n`);

    for (const step of status.steps) {
      const statusIcon = step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : '⏳';
      console.log(`${statusIcon} ${step.name}`);
      console.log(`   Ressources: ${step.resources.length}`);
      if (step.error) {
        console.log(`   Erreur: ${step.error}`);
      }
    }
    console.log('');
  }
}
