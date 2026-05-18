<template>
  <div class="import-view">
    <h1>Import des donnees</h1>

    <div v-if="globalMessage" :class="['message', globalMessageStatus]">
      {{ globalMessage }}
    </div>

    <section class="import-section">
      <h2>Import transactionnel</h2>
      <p class="description">
        Selectionnez les 3 fichiers CSV et images.zip, puis lancez l'import. Si une etape echoue,
        seules les ressources creees pendant cet import sont supprimees ou restaurees.
      </p>

      <div class="file-grid">
        <label>
          Fichier 1 
          <input ref="file1Input" type="file" accept=".csv" @change="handleFileChange($event, 1)" />
        </label>

        <label>
          Fichier 2 
          <input ref="file2Input" type="file" accept=".csv" @change="handleFileChange($event, 2)" />
        </label>

        <label>
          Fichier 3 
          <input ref="file3Input" type="file" accept=".csv" @change="handleFileChange($event, 3)" />
        </label>

        <label>
          Fichier 4 
          <input ref="zipInput" type="file" accept=".zip" @change="handleFileChange($event, 4)" />
        </label>
      </div>

      <button
        class="btn btn-import-all"
        :disabled="!file1 || !file2 || !file3 || !zipFile || isImportingAll"
        @click="importAll"
      >
        {{ isImportingAll ? 'Import en cours...' : 'Importer les 4 fichiers' }}
      </button>

      <div v-if="showImportProgress" class="import-progress">
        <p class="progress-title">Suivi de l'import</p>
        <ul class="progress-list">
          <li v-for="step in importSteps" :key="step.key" :class="['progress-item', step.status]">
            <span class="progress-label">{{ step.label }}</span>
            <span class="progress-status">{{ getStepStatusLabel(step) }}</span>
            <small v-if="step.detail" class="progress-detail">{{ step.detail }}</small>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { parseCSV, detectFileType, getExpectedHeaders, validateImportRows } from '../utils/csvParser';
import {
  extractImagesFromZip,
  importProduits,
  importImages,
  importDeclinaisons,
  importCommandes,
} from '../services/import.service';
import { ImportTransaction } from '../services/transactionManager';

const file1 = ref<File | null>(null);
const file2 = ref<File | null>(null);
const file3 = ref<File | null>(null);
const zipFile = ref<File | null>(null);

const isImportingAll = ref(false);
const globalMessage = ref('');
const globalMessageStatus = ref<'info' | 'success' | 'error'>('info');

const file1Input = ref<HTMLInputElement | null>(null);
const file2Input = ref<HTMLInputElement | null>(null);
const file3Input = ref<HTMLInputElement | null>(null);
const zipInput = ref<HTMLInputElement | null>(null);

type ImportStepStatus = 'waiting' | 'running' | 'success' | 'failed' | 'rolledback';
type ImportStepKey = 'validation' | 'fichier1' | 'images' | 'fichier2' | 'fichier3' | 'rollback';

interface ImportStepUi {
  key: ImportStepKey;
  label: string;
  status: ImportStepStatus;
  detail: string;
}

const initialImportSteps: ImportStepUi[] = [
  { key: 'validation', label: 'Verification des 4 fichiers', status: 'waiting', detail: '' },
  { key: 'fichier1', label: 'Fichier 1 - Produits', status: 'waiting', detail: '' },
  { key: 'fichier2', label: 'Fichier 2 - Declinaisons / stock', status: 'waiting', detail: '' },
  { key: 'images', label: 'Fichier 4 - Images', status: 'waiting', detail: '' },
  { key: 'fichier3', label: 'Fichier 3 - Clients / paniers / commandes', status: 'waiting', detail: '' },
  { key: 'rollback', label: 'Annulation transactionnelle', status: 'waiting', detail: '' },
];

const importSteps = ref<ImportStepUi[]>(initialImportSteps.map((step) => ({ ...step })));
const showImportProgress = ref(false);

function handleFileChange(event: Event, fileNumber: 1 | 2 | 3 | 4): void {
  const input = event.target as HTMLInputElement;
  const selected = input.files?.[0] || null;

  if (fileNumber === 1) file1.value = selected;
  if (fileNumber === 2) file2.value = selected;
  if (fileNumber === 3) file3.value = selected;
  if (fileNumber === 4) zipFile.value = selected;
}

function resetImportProgress(): void {
  importSteps.value = initialImportSteps.map((step) => ({ ...step }));
  showImportProgress.value = true;
}

function setStepStatus(key: ImportStepKey, status: ImportStepStatus, detail = ''): void {
  const step = importSteps.value.find((item) => item.key === key);
  if (!step) return;
  step.status = status;
  step.detail = detail;
}

function markImportedStepsRolledBack(): void {
  importSteps.value.forEach((step) => {
    if (['fichier1', 'fichier2', 'fichier3', 'images'].includes(step.key) && step.status === 'success') {
      step.status = 'rolledback';
      step.detail = 'Import annule: les donnees creees ont ete supprimees ou restaurees.';
    }
  });
}

function getStepStatusLabel(step: ImportStepUi): string {
  if (step.status === 'success' && step.key === 'validation') return 'Valide';
  if (step.status === 'success' && step.key === 'rollback') return 'Termine';

  const labels: Record<ImportStepStatus, string> = {
    waiting: 'En attente',
    running: 'En cours',
    success: 'Importe',
    failed: 'Erreur',
    rolledback: 'Annule',
  };
  return labels[step.status];
}

function formatDuration(startTime: number): string {
  const seconds = Math.max(1, Math.round((performance.now() - startTime) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
}

function parseTypedCsv(file: File, expectedType: 'produits' | 'declinaisons' | 'commandes') {
  return file.text().then((content) => {
    const data = parseCSV(content);
    if (data.length < 2) {
      throw new Error(`${file.name}: au moins un en-tete et une ligne sont requis`);
    }

    const headers = data[0];
    const detected = detectFileType(headers);
    if (detected !== expectedType) {
      throw new Error(
        `${file.name}: format invalide (${detected}). ` +
        `Colonnes attendues exactement: ${getExpectedHeaders(expectedType).join(', ')}`
      );
    }

    const rows = data.slice(1);
    validateImportRows(expectedType, headers, rows);

    return { headers, rows };
  });
}

function clearFiles(): void {
  file1.value = null;
  file2.value = null;
  file3.value = null;
  zipFile.value = null;
  if (file1Input.value) file1Input.value.value = '';
  if (file2Input.value) file2Input.value.value = '';
  if (file3Input.value) file3Input.value.value = '';
  if (zipInput.value) zipInput.value.value = '';
}

async function prepareImportEnvironment(): Promise<void> {
  const response = await fetch('/newapp-api/prepare-import.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || `Preparation import impossible: HTTP ${response.status}`);
  }
}

async function importAll(): Promise<void> {
  if (!file1.value || !file2.value || !file3.value) {
    globalMessage.value = 'Les 3 fichiers CSV sont requis. Le fichier ZIP (images) est optionnel.';
    globalMessageStatus.value = 'error';
    return;
  }

  resetImportProgress();
  isImportingAll.value = true;
  const importStartTime = performance.now();
  globalMessage.value = 'Import en cours: les 3 fichiers CSV seront valides ensemble. Images optionnelles.';
  globalMessageStatus.value = 'info';
  let currentStep: ImportStepKey = 'validation';

  const transaction = new ImportTransaction();

  try {
    setStepStatus('validation', 'running', 'Lecture et controle des formats CSV' + (zipFile.value ? '/ZIP' : '') + '.');
    await prepareImportEnvironment();
    const [csv1, csv2, csv3, images] = await Promise.all([
      parseTypedCsv(file1.value, 'produits'),
      parseTypedCsv(file2.value, 'declinaisons'),
      parseTypedCsv(file3.value, 'commandes'),
      zipFile.value ? extractImagesFromZip(zipFile.value) : Promise.resolve({}),
    ]);
    setStepStatus('validation', 'success', 'Les fichiers CSV sont lisibles et au bon format' + (zipFile.value ? '. ZIP valide.' : '.'));

    currentStep = 'fichier1';
    setStepStatus('fichier1', 'running', 'Import des produits en cours.');
    await importProduits(csv1.rows, csv1.headers, transaction);
    setStepStatus('fichier1', 'success', `${csv1.rows.length} ligne(s) traitee(s).`);

    currentStep = 'fichier2';
    setStepStatus('fichier2', 'running', 'Import des declinaisons et stocks en cours.');
    await importDeclinaisons(csv2.rows, csv2.headers, transaction);
    setStepStatus('fichier2', 'success', `${csv2.rows.length} ligne(s) traitee(s).`);

    currentStep = 'images';
    if (zipFile.value && Object.keys(images).length > 0) {
      setStepStatus('images', 'running', 'Import des images produits en cours.');
      await importImages(images, transaction);
      setStepStatus('images', 'success', `${Object.keys(images).length} image(s) importee(s).`);
    } else {
      setStepStatus('images', 'success', 'Pas d\'images a importer (ZIP non fourni ou vide).');
    }

    currentStep = 'fichier3';
    setStepStatus('fichier3', 'running', 'Import des clients, paniers et commandes en cours.');
    await importCommandes(csv3.rows, csv3.headers, transaction);
    setStepStatus('fichier3', 'success', `${csv3.rows.length} ligne(s) traitee(s).`);
    setStepStatus('rollback', 'success', 'Aucun rollback necessaire.');

    const status = transaction.getStatus();
    transaction.logReport();

    globalMessage.value = `Import reussi en ${formatDuration(importStartTime)}: ${status.totalResourcesCreated} ressources traitees.`;
    globalMessageStatus.value = 'success';
    clearFiles();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = transaction.getStatus();
    const failedStep = status.steps.find((step) => step.status === 'pending')?.name
      || status.steps[status.steps.length - 1]?.name
      || currentStep;
    const failedStepKey = (['fichier1', 'fichier2', 'fichier3', 'images'].includes(failedStep)
      ? failedStep
      : currentStep) as ImportStepKey;

    setStepStatus(failedStepKey, 'failed', message);
    setStepStatus('rollback', 'running', 'Erreur detectee: annulation de tout ce qui a deja ete importe.');
    if (failedStep === currentStep && !status.steps.some((step) => step.name === failedStep)) {
      transaction.registerStep(failedStep);
    }
    await transaction.markStepFailed(failedStep, message);
    markImportedStepsRolledBack();
    setStepStatus('rollback', 'success', 'Rollback termine. Aucun reset complet lance.');
    transaction.logReport();
    const failedLabel = importSteps.value.find((step) => step.key === failedStepKey)?.label || failedStepKey;
    globalMessage.value = `Import echoue apres ${formatDuration(importStartTime)}: erreur dans ${failedLabel}. Rollback effectue sans reset complet. Details: ${message}`;
    globalMessageStatus.value = 'error';
  } finally {
    isImportingAll.value = false;
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
}

.description {
  color: #666;
  margin-bottom: 1.5rem;
}

.file-grid {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

label {
  display: grid;
  gap: 0.4rem;
  font-weight: 600;
}

input {
  padding: 0.55rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.btn-import-all {
  background: #007bff;
  color: white;
}

.btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
}

.import-progress {
  margin-top: 1.25rem;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
}

.progress-title {
  margin: 0 0 0.75rem;
  font-weight: 700;
  color: #333;
}

.progress-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

.progress-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.25rem 0.75rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid #e2e2e2;
  border-left: 4px solid #b8b8b8;
  border-radius: 4px;
  background: #fafafa;
}

.progress-label {
  min-width: 0;
  font-weight: 600;
  color: #333;
}

.progress-status {
  font-weight: 700;
  color: #555;
}

.progress-detail {
  grid-column: 1 / -1;
  color: #666;
}

.progress-item.running {
  border-left-color: #007bff;
  background: #f0f7ff;
}

.progress-item.success {
  border-left-color: #28a745;
  background: #f3fbf5;
}

.progress-item.failed {
  border-left-color: #dc3545;
  background: #fff5f5;
}

.progress-item.rolledback {
  border-left-color: #fd7e14;
  background: #fff8f0;
}

.message {
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-weight: 600;
}

.message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.info {
  background-color: #e7f3ff;
  color: #084b83;
  border: 1px solid #b7dafc;
}

.message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
</style>
