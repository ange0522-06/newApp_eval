<template>
  <div class="reset-module">
    <h1>Réinitialisation des données</h1>

    <!-- Avertissement -->
    <div class="warning-box">
      <p class="warning-text">
        Cette action supprimera toutes les données importées.
        <br />
        <strong>Cette action est irréversible.</strong>
      </p>
    </div>

    <!-- Bouton de réinitialisation -->
    <div class="button-container">
      <button
        @click="openConfirmModal"
        :disabled="isRunning"
        class="btn btn-reset"
        :class="{ 'is-loading': isRunning }"
      >
        <span v-if="!isRunning">Réinitialiser les données</span>
        <span v-else>Réinitialisation en cours...</span>
      </button>
    </div>

    <!-- Modale de confirmation -->
    <div v-if="showConfirmModal" class="modal-overlay" @click="closeConfirmModal">
      <div class="modal-content" @click.stop>
        <h2>Confirmer la réinitialisation</h2>
        <p>Êtes-vous sûr ? Cette action est irréversible.</p>
        
        <div class="modal-buttons">
          <button
            @click="confirmAndReset"
            class="btn btn-confirm"
          >
            Confirmer
          </button>
          <button
            @click="closeConfirmModal"
            class="btn btn-cancel"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>

    <!-- Message de résultat -->
    <div
      v-if="message"
      class="message"
      :class="{ 'is-success': isSuccess, 'is-error': !isSuccess }"
    >
      {{ message }}
    </div>

    <!-- Détails des erreurs -->
    <div v-if="details && (details.failed.length > 0 || details.deleted.length > 0 || details.updated.length > 0)" class="details-box">
      <!-- Résumé -->
      <div class="summary">
        <p v-if="details.deletedCount > 0" class="deleted-count">
          ✓ <strong>{{ details.deletedCount }}</strong> élément(s) supprimé(s)
        </p>
        <p v-if="details.updatedCount > 0" class="updated-count">
          ✓ <strong>{{ details.updatedCount }}</strong> élément(s) mis à jour
        </p>
        <p v-if="details.failed.length > 0" class="failed-count">
          ✗ <strong>{{ details.failed.length }}</strong> erreur(s)
        </p>
        <p v-if="details.skipped.length > 0" class="skipped-count">
          ⊙ <strong>{{ details.skipped.length }}</strong> élément(s) ignoré(s)
        </p>
      </div>

      <!-- Erreurs détaillées -->
      <div v-if="details.failed.length > 0" class="errors-section">
        <h3>Détails des erreurs ({{ details.failed.length }}):</h3>
        <ul class="error-list">
          <li v-for="(error, idx) in details.failed" :key="idx" class="error-item">
            {{ error }}
          </li>
        </ul>
      </div>

      <!-- Éléments supprimés -->
      <div v-if="details.deleted.length > 0" class="deleted-section">
        <h3>Éléments supprimés:</h3>
        <ul class="deleted-list">
          <li v-for="(deleted, idx) in details.deleted" :key="idx" class="deleted-item">
            {{ deleted }}
          </li>
        </ul>
      </div>

      <!-- Éléments mis à jour -->
      <div v-if="details.updated.length > 0" class="updated-section">
        <h3>Éléments mis à jour:</h3>
        <ul class="updated-list">
          <li v-for="(updated, idx) in details.updated" :key="idx" class="updated-item">
            {{ updated }}
          </li>
        </ul>
      </div>

      <!-- Éléments ignorés -->
      <div v-if="details.skipped.length > 0" class="skipped-section">
        <h3>Éléments ignorés (protégés):</h3>
        <ul class="skipped-list">
          <li v-for="(skip, idx) in details.skipped" :key="idx" class="skipped-item">
            {{ skip }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useReset } from '../composables/useReset';

const { isRunning, message, isSuccess, details, performReset } = useReset();
const showConfirmModal = ref(false);

function openConfirmModal(): void {
  showConfirmModal.value = true;
}

function closeConfirmModal(): void {
  showConfirmModal.value = false;
}

async function confirmAndReset(): Promise<void> {
  closeConfirmModal();
  await performReset();
}
</script>

<style scoped>
.reset-module {
  max-width: 600px;
  margin: 2rem auto;
  padding: 2rem;
}

h1 {
  font-size: 2rem;
  margin-bottom: 2rem;
  color: #333;
}

.warning-box {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 2rem;
}

.warning-text {
  color: #856404;
  margin: 0;
  line-height: 1.6;
}

.button-container {
  display: flex;
  justify-content: center;
  margin-bottom: 2rem;
}

.btn {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.btn-reset {
  background-color: #dc3545;
  color: white;
}

.btn-reset:hover:not(:disabled) {
  background-color: #c82333;
}

.btn-reset:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-reset.is-loading {
  opacity: 0.8;
}

/* Modale */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  max-width: 400px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  color: #333;
}

.modal-content p {
  margin-bottom: 2rem;
  color: #666;
}

.modal-buttons {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn-confirm {
  background-color: #dc3545;
  color: white;
}

.btn-confirm:hover {
  background-color: #c82333;
}

.btn-cancel {
  background-color: #6c757d;
  color: white;
}

.btn-cancel:hover {
  background-color: #5a6268;
}

/* Messages */
.message {
  margin-top: 2rem;
  padding: 1rem;
  border-radius: 4px;
  text-align: center;
  font-weight: 600;
}

.message.is-success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.is-error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
</style>
