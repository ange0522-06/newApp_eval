<template>
  <div class="import-view">
    <h1>Import des données</h1>

    <!-- Message global avec transaction -->
    <div v-if="globalMessage" :class="['message', 'global-message', globalMessageSuccess ? 'success' : 'error']">
      {{ globalMessage }}
    </div>

    <!-- Bouton Import All (Tout ou Rien) -->
    <div class="import-all-section">
      <h2>🔄 Import transactionnel (TOUT OU RIEN)</h2>
      <p class="description">
        Sélectionnez les 3 fichiers et cliquez pour importer en une seule transaction.
        Si une étape échoue, toutes les ressources créées seront supprimées (rollback).
      </p>
      <button
        @click="importAll"
        :disabled="!file1 || !file2 || !file3 || isImportingAll"
        class="btn btn-import-all"
      >
        {{ isImportingAll ? '⏳ Import en cours...' : '✅ IMPORTER TOUT (3 FICHIERS)' }}
      </button>
    </div>

    <hr class="separator" />

    <!-- Fichier 1 : Produits -->
    <div class="import-section">
      <h2>Fichier 1 — Produits</h2>
      <p class="description">
        Colonnes attendues : date_produit, nom, reference, prix_ttc, Taxe, categorie
      </p>

      <div class="file-input-group">
        <input
          ref="file1Input"
          type="file"
          accept=".csv"
          @change="handleFile1Change"
          :disabled="isImporting1"
          class="file-input"
        />
        <button
          @click="importFile1"
          :disabled="!file1 || isImporting1"
          class="btn btn-import"
        >
          {{ isImporting1 ? 'Import en cours...' : 'Importer Fichier 1' }}
        </button>
      </div>

      <div v-if="message1" :class="['message', message1Success ? 'success' : 'error']">
        {{ message1 }}
      </div>
    </div>

    <!-- Fichier 2 : Déclinaisons -->
    <div class="import-section">
      <h2>Fichier 2 — Déclinaisons et stock</h2>
      <p class="description">
        Colonnes attendues : reference, specificité (ou specificite), karazany, stock_initial, prix_vente_ttc
      </p>

      <div class="file-input-group">
        <input
          ref="file2Input"
          type="file"
          accept=".csv"
          @change="handleFile2Change"
          :disabled="isImporting2"
          class="file-input"
        />
        <button
          @click="importFile2"
          :disabled="!file2 || isImporting2"
          class="btn btn-import"
        >
          {{ isImporting2 ? 'Import en cours...' : 'Importer Fichier 2' }}
        </button>
      </div>

      <div v-if="message2" :class="['message', message2Success ? 'success' : 'error']">
        {{ message2 }}
      </div>
    </div>

    <!-- Fichier 3 : Clients et Commandes -->
    <div class="import-section">
      <h2>Fichier 3 — Clients et commandes</h2>
      <p class="description">
        Colonnes attendues : date, nom, email, pwd, adresse, achat, etat
      </p>

      <div class="file-input-group">
        <input
          ref="file3Input"
          type="file"
          accept=".csv"
          @change="handleFile3Change"
          :disabled="isImporting3"
          class="file-input"
        />
        <button
          @click="importFile3"
          :disabled="!file3 || isImporting3"
          class="btn btn-import"
        >
          {{ isImporting3 ? 'Import en cours...' : 'Importer Fichier 3' }}
        </button>
      </div>

      <div v-if="message3" :class="['message', message3Success ? 'success' : 'error']">
        {{ message3 }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { parseCSV, detectFileType } from '../utils/csvParser';
import { importProduits, importDeclinaisons, importCommandes } from '../services/import.service';
import { ImportTransaction } from '../services/transactionManager';

// Transaction pour tous les imports
let transaction: ImportTransaction | null = null;

// État des fichiers
const file1 = ref<File | null>(null);
const file2 = ref<File | null>(null);
const file3 = ref<File | null>(null);

// État d'import
const isImporting1 = ref(false);
const isImporting2 = ref(false);
const isImporting3 = ref(false);
const isImportingAll = ref(false);

// Messages
const message1 = ref('');
const message1Success = ref(false);
const message2 = ref('');
const message2Success = ref(false);
const message3 = ref('');
const message3Success = ref(false);
const globalMessage = ref('');
const globalMessageSuccess = ref(false);

// Refs pour inputs
const file1Input = ref<HTMLInputElement | null>(null);
const file2Input = ref<HTMLInputElement | null>(null);
const file3Input = ref<HTMLInputElement | null>(null);

/**
 * Handlers pour changement de fichier
 */
function handleFile1Change(event: Event): void {
  const input = event.target as HTMLInputElement;
  file1.value = input.files?.[0] || null;
}

function handleFile2Change(event: Event): void {
  const input = event.target as HTMLInputElement;
  file2.value = input.files?.[0] || null;
}

function handleFile3Change(event: Event): void {
  const input = event.target as HTMLInputElement;
  file3.value = input.files?.[0] || null;
}

/**
 * Reset global message
 */
function resetGlobalMessage(): void {
  globalMessage.value = '';
  globalMessageSuccess.value = false;
}

/**
 * Import tous les fichiers en une seule transaction (TOUT OU RIEN)
 */
async function importAll(): Promise<void> {
  if (!file1.value || !file2.value || !file3.value) {
    globalMessage.value = '❌ Tous les fichiers doivent être sélectionnés';
    globalMessageSuccess.value = false;
    return;
  }

  isImportingAll.value = true;
  resetGlobalMessage();
  
  // Créer une nouvelle transaction
  transaction = new ImportTransaction();

  try {
    // === FICHIER 1 ===
    console.log('\n📦 === ÉTAPE 1 : FICHIER 1 (PRODUITS) ===\n');
    const content1 = await file1.value.text();
    const data1 = parseCSV(content1);

    if (data1.length < 2) {
      throw new Error('Fichier 1 : au moins 1 en-tête et 1 ligne requise');
    }

    const headers1 = data1[0];
    const fileType1 = detectFileType(headers1);

    if (fileType1 !== 'produits') {
      throw new Error(
        'Fichier 1 : colonnes invalides. Attendues: nom, reference, prix_ttc, Taxe, categorie'
      );
    }

    const rows1 = data1.slice(1);
    await importProduits(rows1, headers1, transaction);

    // === FICHIER 2 ===
    console.log('\n📦 === ÉTAPE 2 : FICHIER 2 (DÉCLINAISONS) ===\n');
    const content2 = await file2.value.text();
    const data2 = parseCSV(content2);

    if (data2.length < 2) {
      throw new Error('Fichier 2 : au moins 1 en-tête et 1 ligne requise');
    }

    const headers2 = data2[0];
    const fileType2 = detectFileType(headers2);

    if (fileType2 !== 'declinaisons') {
      throw new Error(
        'Fichier 2 : colonnes invalides. Attendues: reference, specificite, karazany, stock_initial'
      );
    }

    const rows2 = data2.slice(1);
    await importDeclinaisons(rows2, headers2, transaction);

    // === FICHIER 3 ===
    console.log('\n📦 === ÉTAPE 3 : FICHIER 3 (COMMANDES) ===\n');
    const content3 = await file3.value.text();
    const data3 = parseCSV(content3);

    if (data3.length < 2) {
      throw new Error('Fichier 3 : au moins 1 en-tête et 1 ligne requise');
    }

    const headers3 = data3[0];
    const fileType3 = detectFileType(headers3);

    if (fileType3 !== 'commandes') {
      throw new Error(
        'Fichier 3 : colonnes invalides. Attendues: date, nom, email, pwd, adresse, achat, etat'
      );
    }

    const rows3 = data3.slice(1);
    await importCommandes(rows3, headers3, transaction);

    // === SUCCÈS ===
    const status = transaction.getStatus();
    transaction.logReport();
    
    globalMessage.value = `✅ SUCCÈS! ${status.totalResourcesCreated} ressources créées en 3 étapes`;
    globalMessageSuccess.value = true;

    // Réinitialiser les fichiers
    file1.value = null;
    file2.value = null;
    file3.value = null;
    if (file1Input.value) file1Input.value.value = '';
    if (file2Input.value) file2Input.value.value = '';
    if (file3Input.value) file3Input.value.value = '';

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Marquer l'étape en cours comme échouée et déclencher rollback
    if (transaction) {
      const failedStep = transaction.getStatus().steps.find((s) => s.status === 'pending') ?? transaction.getStatus().steps[transaction.getStatus().steps.length - 1];
      if (failedStep) {
        await transaction.markStepFailed(failedStep.name, errorMsg);
      }
      
      // Afficher le rapport
      transaction.logReport();
    }

    globalMessage.value = `❌ Erreur: ${errorMsg}. Rollback transactionnel effectué!`;
    globalMessageSuccess.value = false;
    console.error('Erreur import:', error);
  } finally {
    isImportingAll.value = false;
  }
}

/**
 * Import Fichier 1 uniquement (mode individuel, SANS transaction)
 */
async function importFile1(): Promise<void> {
  if (!file1.value) return;

  isImporting1.value = true;
  message1.value = '';

  try {
    const content = await file1.value.text();
    const data = parseCSV(content);

    if (data.length < 2) {
      throw new Error('Le fichier doit contenir au moins 1 en-tête et 1 ligne de données');
    }

    const headers = data[0];
    const fileType = detectFileType(headers);

    if (fileType !== 'produits') {
      throw new Error(
        'Ce fichier n\'a pas le bon format. Il doit contenir les colonnes : nom, reference, prix_ttc, Taxe, categorie'
      );
    }

    const rows = data.slice(1);
    // Mode individuel : créer une transaction temporaire
    const tempTransaction = new ImportTransaction();
    await importProduits(rows, headers, tempTransaction);
    tempTransaction.markStepSuccess('fichier1');
    tempTransaction.logReport();

    message1.value = `✅ Import terminé : ${rows.length} lignes traitées`;
    message1Success.value = true;

    // Réinitialiser l'input
    if (file1Input.value) {
      file1Input.value.value = '';
    }
    file1.value = null;
  } catch (error) {
    message1.value = `❌ Erreur : ${error instanceof Error ? error.message : String(error)}`;
    message1Success.value = false;
    console.error('Erreur import fichier 1:', error);
  } finally {
    isImporting1.value = false;
  }
}

/**
 * Import Fichier 2 uniquement (mode individuel, SANS transaction)
 */
async function importFile2(): Promise<void> {
  if (!file2.value) return;

  isImporting2.value = true;
  message2.value = '';

  try {
    const content = await file2.value.text();
    const data = parseCSV(content);

    if (data.length < 2) {
      throw new Error('Le fichier doit contenir au moins 1 en-tête et 1 ligne de données');
    }

    const headers = data[0];
    const fileType = detectFileType(headers);

    if (fileType !== 'declinaisons') {
      throw new Error(
        'Ce fichier n\'a pas le bon format. Il doit contenir les colonnes : reference, specificite, karazany, stock_initial'
      );
    }

    const rows = data.slice(1);
    // Mode individuel : créer une transaction temporaire
    const tempTransaction = new ImportTransaction();
    await importDeclinaisons(rows, headers, tempTransaction);
    tempTransaction.markStepSuccess('fichier2');
    tempTransaction.logReport();

    message2.value = `✅ Import terminé : ${rows.length} lignes traitées`;
    message2Success.value = true;

    // Réinitialiser l'input
    if (file2Input.value) {
      file2Input.value.value = '';
    }
    file2.value = null;
  } catch (error) {
    message2.value = `❌ Erreur : ${error instanceof Error ? error.message : String(error)}`;
    message2Success.value = false;
    console.error('Erreur import fichier 2:', error);
  } finally {
    isImporting2.value = false;
  }
}

/**
 * Import Fichier 3 uniquement (mode individuel, SANS transaction)
 */
async function importFile3(): Promise<void> {
  if (!file3.value) return;

  isImporting3.value = true;
  message3.value = '';

  try {
    const content = await file3.value.text();
    const data = parseCSV(content);

    if (data.length < 2) {
      throw new Error('Le fichier doit contenir au moins 1 en-tête et 1 ligne de données');
    }

    const headers = data[0];
    const fileType = detectFileType(headers);

    if (fileType !== 'commandes') {
      throw new Error(
        'Ce fichier n\'a pas le bon format. Il doit contenir les colonnes : date, nom, email, pwd, adresse, achat, etat'
      );
    }

    const rows = data.slice(1);
    // Mode individuel : créer une transaction temporaire
    const tempTransaction = new ImportTransaction();
    await importCommandes(rows, headers, tempTransaction);
    tempTransaction.markStepSuccess('fichier3');
    tempTransaction.logReport();

    message3.value = `✅ Import terminé : ${rows.length} lignes traitées`;
    message3Success.value = true;

    // Réinitialiser l'input
    if (file3Input.value) {
      file3Input.value.value = '';
    }
    file3.value = null;
  } catch (error) {
    message3.value = `❌ Erreur : ${error instanceof Error ? error.message : String(error)}`;
    message3Success.value = false;
    console.error('Erreur import fichier 3:', error);
  } finally {
    isImporting3.value = false;
  }
}
</script>

<style scoped>
.import-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  font-size: 2rem;
  margin-bottom: 2rem;
  color: #333;
}

.import-section {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 2rem;
  margin-bottom: 2rem;
}

.import-section h2 {
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
  color: #444;
}

.description {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 1rem;
  font-style: italic;
}

.file-input-group {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.file-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn-import {
  background-color: #007bff;
  color: white;
}

.btn-import:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-import:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
}

.message {
  padding: 1rem;
  border-radius: 4px;
  font-weight: 600;
}

.message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
</style>
