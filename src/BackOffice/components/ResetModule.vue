<template>
  <div class="reset-module">
    <h1>Module de Réinitialisation PrestaShop</h1>
    
    <div class="warning-message">
      ⚠️ Cette action va réinitialiser TOUTES les données: produits, stocks, clients et commandes.
      Cette opération est irréversible. Continuer ?
    </div>

    <div class="buttons-grid">
      <button
        @click="confirmAndResetAll"
        :disabled="isRunning"
        class="btn btn-reset-all"
      >
        <span v-if="!isRunning">🔄 Réinitialiser TOUT</span>
        <span v-else>
          <span class="spinner"></span> Réinitialisation en cours...
        </span>
      </button>
    </div>

    <!-- Section progression -->
    <div v-if="isRunning" class="progress-section">
      <p>Traitement : <strong>{{ progress }} / {{ total }}</strong></p>
      <progress :value="progress" :max="total"></progress>
      <p class="current-operation">{{ currentOperation }}</p>
    </div>

    <!-- Section rapport -->
    <div v-if="!isRunning && total > 0" class="report-section">
      <h2>Résumé de la réinitialisation</h2>
      
      <div class="success-message">
        ✅ <strong>{{ totalSuccess }} élément(s)</strong> traité(s) avec succès
      </div>

      <div v-if="totalFailed > 0" class="error-message">
        ❌ <strong>{{ totalFailed }} erreur(s)</strong>
      </div>

      <div v-if="errors.length > 0" class="errors-list">
        <h3>Détails des erreurs :</h3>
        <ul>
          <li v-for="(error, index) in errors" :key="index">
            {{ error }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReset } from '../composables/useReset';

const {
  progress,
  total,
  errors,
  isRunning,
  resetAll,
  currentOperation
} = useReset();

const totalSuccess = computed(() => {
  return total.value - errors.value.length;
});

const totalFailed = computed(() => {
  return errors.value.length;
});

function confirmAndResetAll() {
  if (window.confirm('⚠️ ATTENTION: Cette action est IRRÉVERSIBLE!\n\nToutes les données vont être réinitialisées:\n- Produits: SUPPRIMÉS\n- Stocks: Mis à 0\n- Clients: SUPPRIMÉS\n- Commandes: SUPPRIMÉES\n\nContinuer ?')) {
    resetAll();
  }
}
</script>
