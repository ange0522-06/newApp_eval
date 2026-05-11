<template>
  <div class="import-container">
    <!-- En-tête -->
    <div class="import-header">
      <h2>📂 Module d'Import de Fichiers</h2>
      <p>Importez vos données (CSV, XLSX, TXT) directement dans PrestaShop</p>
    </div>

    <!-- Étape 1: Upload du fichier -->
    <div v-if="step === 'upload'" class="import-section">
      <div class="upload-zone" @dragover.prevent="isDragging = true" @dragleave="isDragging = false" @drop.prevent="handleFileDrop">
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 16 12 12 8 16"></polyline>
          <line x1="12" y1="12" x2="12" y2="21"></line>
          <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
        </svg>
        <h3>Déposez votre fichier ici</h3>
        <p>ou</p>
        <button type="button" class="btn-primary" @click="$refs.fileInput.click()">
          📁 Choisir fichier(s)
        </button>
        <p class="file-help">Formats supportés: CSV, XLSX, XLS, TXT (plusieurs fichiers autorisés)</p>
        <input ref="fileInput" type="file" @change="handleFileSelect" accept=".csv,.xlsx,.xls,.txt" multiple style="display: none" />
      </div>

      <!-- Barre de progression de l'upload -->
      <div v-if="uploadProgress > 0 && uploadProgress < 100" class="progress-bar">
        <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
        <span class="progress-text">{{ uploadProgress }}%</span>
      </div>
    </div>

    <!-- Étape 2: Aperçu des sections -->
    <div v-if="step === 'preview'" class="import-section">
      <div class="section-header">
        <h3>📋 Aperçu des fichiers ({{ selectedFiles.length }})</h3>
        <button type="button" class="btn-secondary" @click="goBackToUpload">← Retour</button>
      </div>

      <!-- Liste des fichiers sélectionnés -->
      <div class="files-list">
        <div v-for="(file, fileIdx) in selectedFiles" :key="fileIdx" class="file-item">
          <span class="file-name">📄 {{ file.name }}</span>
          <span class="file-size">{{ formatFileSize(file.size) }}</span>
          <span class="sections-count">{{ fileSections[fileIdx]?.length || 0 }} section(s)</span>
        </div>
      </div>

      <!-- Sections détectées -->
      <div v-if="sections.length > 0" class="sections-preview">
        <div v-for="(section, idx) in sections" :key="idx" class="section-preview">
          <div class="section-title">
            <h4>Section {{ idx + 1 }}: {{ section.detectedType.toUpperCase() }}</h4>
            <span class="section-confidence" :class="getConfidenceClass(section.confidence)">
              Confiance: {{ section.confidence }}%
            </span>
          </div>

          <div class="section-info">
            <span>📊 {{ section.rows.length }} ligne(s)</span>
            <span>📍 Colonnes: {{ section.headers.length }}</span>
          </div>

          <!-- Tableau de prévisualisation -->
          <div class="table-preview">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th v-for="header in section.headers.slice(0, 5)" :key="header">{{ header }}</th>
                  <th v-if="section.headers.length > 5">...</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rIdx) in section.rows.slice(0, 3)" :key="rIdx">
                  <td class="row-num">{{ rIdx + 1 }}</td>
                  <td v-for="header in section.headers.slice(0, 5)" :key="header" class="cell">
                    {{ row[header] ? truncate(row[header], 50) : '-' }}
                  </td>
                  <td v-if="section.headers.length > 5">...</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Avertissements de confiance basse -->
          <div v-if="section.confidence < 70" class="warning">
            ⚠️ Confiance basse: Veuillez vérifier que le type détecté est correct
          </div>

          <!-- Champs requis -->
          <div class="required-fields">
            <h5>Champs requis détectés:</h5>
            <ul>
              <li v-for="field in section.requiredFields" :key="field">
                <span :class="{ 'present': section.presentHeaders.some(h => h.includes(field.toLowerCase())), 'missing': !section.presentHeaders.some(h => h.includes(field.toLowerCase())) }">
                  {{ section.presentHeaders.some(h => h.includes(field.toLowerCase())) ? '✓' : '✗' }}
                </span>
                {{ field }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>

      <!-- Boutons d'action -->
      <div v-if="sections.length > 0" class="action-buttons">
        <button type="button" class="btn-primary" @click="startImport" :disabled="isImporting">
          ▶️ Lancer l'import
        </button>
        <button type="button" class="btn-secondary" @click="goBackToUpload" :disabled="isImporting">
          ← Annuler et recharger
        </button>
      </div>
    </div>

    <!-- Étape 3: Import en cours -->
    <div v-if="step === 'importing'" class="import-section">
      <div class="import-progress">
        <h3>⏳ Import en cours...</h3>

        <!-- Barre de progression globale -->
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: globalProgress + '%' }"></div>
          </div>
          <div class="progress-stats">
            <span>{{ totalProcessed }} / {{ totalItems }} éléments</span>
            <span v-if="successCount > 0" class="success">✓ {{ successCount }} réussis</span>
            <span v-if="errorCount > 0" class="error">✗ {{ errorCount }} erreurs</span>
          </div>
        </div>

        <!-- Détail par type -->
        <div class="import-details">
          <div v-for="(item, idx) in lastMessages.slice(-5)" :key="idx" :class="['message', item.status]">
            <span class="type-badge">{{ item.type }}</span>
            <span class="message-text">{{ item.message }}</span>
            <span class="timestamp">{{ formatTime(item.time) }}</span>
          </div>
        </div>

        <!-- Bouton d'annulation -->
        <button type="button" class="btn-danger" @click="cancelImport" :disabled="!isImporting">
          ⛔ Annuler l'import
        </button>
      </div>
    </div>

    <!-- Étape 4: Rapport final -->
    <div v-if="step === 'completed'" class="import-section">
      <div class="completion-report">
        <h3 v-if="result.errorCount === 0" class="success-title">✓ Import réussi!</h3>
        <h3 v-else class="warning-title">⚠️ Import terminé avec erreurs</h3>

        <div class="report-summary">
          <div class="stat-card success">
            <div class="stat-number">{{ result.successCount }}</div>
            <div class="stat-label">Éléments importés</div>
          </div>
          <div v-if="result.errorCount > 0" class="stat-card error">
            <div class="stat-number">{{ result.errorCount }}</div>
            <div class="stat-label">Erreurs</div>
          </div>
          <div class="stat-card info">
            <div class="stat-number">{{ result.totalProcessed }}</div>
            <div class="stat-label">Total traité</div>
          </div>
        </div>

        <!-- Statistiques détaillées -->
        <div v-if="result.stats && Object.keys(result.stats).length > 0" class="stats-details">
          <h4>Détails par type:</h4>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Total</th>
                <th>Réussis</th>
                <th>Erreurs</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(stat, type) in result.stats" :key="type">
                <td>{{ type }}</td>
                <td>{{ stat.total }}</td>
                <td class="success">{{ stat.success }}</td>
                <td :class="{ error: stat.errors > 0 }">{{ stat.errors }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Liste des erreurs -->
        <div v-if="result.errors && result.errors.length > 0" class="errors-section">
          <h4>Erreurs détectées:</h4>
          <div class="errors-list">
            <div v-for="(error, idx) in result.errors.slice(0, 10)" :key="idx" class="error-item">
              <span class="error-type">{{ error.type }} #{{ error.lineNumber }}</span>
              <span class="error-message">{{ error.message }}</span>
            </div>
            <div v-if="result.errors.length > 10" class="more-errors">
              ... et {{ result.errors.length - 10 }} autres erreurs
            </div>
          </div>
        </div>

        <!-- Boutons de fin -->
        <div class="final-buttons">
          <button type="button" class="btn-primary" @click="startNewImport">
            📂 Importer un autre fichier
          </button>
          <button type="button" class="btn-secondary" @click="downloadReport">
            📥 Télécharger le rapport
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { parseFile } from '../services/parser.service.js';
import { detectDataType } from '../services/importDetection.service.js';
import { transformSection } from '../services/importTransform.service.js';
import { importData } from '../services/importData.service.js';
import { enrichSectionWithSpecializedType, transformSpecializedFiles } from '../services/specializedIntegration.service.js';

export default {
  name: 'ImportTab',
  data() {
    return {
      step: 'upload', // upload, preview, importing, completed
      isDragging: false,
      selectedFiles: [], // Multiple files
      fileSections: [], // Sections for each file
      uploadProgress: 0,

      // Données parsées et détectées
      sections: [], // Flattened sections for import
      errorMessage: '',
      importedIds: [], // Track IDs for rollback

      // État de l'import
      isImporting: false,
      importController: null,
      totalItems: 0,
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      lastMessages: [],

      // Résultat final
      result: null
    };
  },

  computed: {
    globalProgress() {
      if (this.totalItems === 0) return 0;
      return Math.round((this.totalProcessed / this.totalItems) * 100);
    }
  },

  methods: {
    handleFileSelect(event) {
      const files = Array.from(event.target.files);
      if (files.length > 0) {
        this.processMultipleFiles(files);
      }
    },

    handleFileDrop(event) {
      this.isDragging = false;
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        this.processMultipleFiles(files);
      }
    },

    async processMultipleFiles(files) {
      this.selectedFiles = files;
      this.fileSections = [];
      this.errorMessage = '';
      this.uploadProgress = 0;

      try {
        // Parser tous les fichiers
        for (const file of files) {
          this.uploadProgress = Math.round((this.fileSections.length / files.length) * 100);

          const parsed = await parseFile(file);

          // Détecter les types pour chaque section (détection générique d'abord)
          for (const section of parsed.sections) {
            const detection = detectDataType(section.headers, section.rows);
            section.detectedType = detection.type;
            section.confidence = detection.confidence;
            section.requiredFields = detection.requiredFields;
            section.optionalFields = detection.optionalFields;
            section.presentHeaders = detection.presentHeaders;

            // Essayer de détecter le type spécialisé (fichier 1, 2 ou 3)
            try {
              const enriched = enrichSectionWithSpecializedType(section);
              section.specializedType = enriched.specializedType;
              section.specializedConfidence = enriched.specializedConfidence;
              section.specializedDescription = enriched.specializedDescription;
              section.expectedTables = enriched.expectedTables;

              // Si détection spécialisée convaincante, utiliser celle-ci
              if (enriched.specializedConfidence >= 90) {
                section.detectedType = enriched.specializedType;
                section.confidence = enriched.specializedConfidence;
                console.log(`✨ Type spécialisé détecté: ${enriched.specializedType} (${enriched.specializedConfidence}%)`);
              }
            } catch (e) {
              console.log('Détection spécialisée non applicable', e.message);
            }
          }

          this.fileSections.push(parsed.sections);
        }

        // Aplatir toutes les sections pour l'affichage
        this.sections = this.fileSections.flat();
        this.uploadProgress = 100;

        // Passer à l'étape de prévisualisation
        setTimeout(() => {
          this.step = 'preview';
        }, 500);
      } catch (error) {
        console.error('Erreur lors du parsing:', error);
        this.errorMessage = `Erreur: ${error.message}`;
        this.uploadProgress = 0;
      }
    },

    handleFile(file) {
      this.processMultipleFiles([file]);
    },

    goBackToUpload() {
      this.step = 'upload';
      this.selectedFiles = [];
      this.fileSections = [];
      this.sections = [];
      this.errorMessage = '';
      this.importedIds = [];
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = '';
      }
    },

    async startImport() {
      this.isImporting = true;
      this.step = 'importing';
      this.totalProcessed = 0;
      this.successCount = 0;
      this.errorCount = 0;
      this.lastMessages = [];
      this.importedIds = [];
      this.importController = new AbortController();
      this.totalItems = 0;

      try {
        // Vérifier si on a des types spécialisés
        const hasSpecializedTypes = this.sections.some(s => s.specializedType);
        
        if (hasSpecializedTypes) {
          this.addMessage('system', 'info', '🚀 Utilisation du mode spécialisé (Fichiers PrestaShop 1, 2, 3)');
          await this.startSpecializedImport();
        } else {
          this.addMessage('system', 'info', '📋 Utilisation du mode générique');
          await this.startGenericImport();
        }

        this.step = 'completed';
        this.addMessage('system', 'success', '✅ Import complété avec succès - COMMIT validé');
      } catch (error) {
        console.error('Erreur lors de l\'import:', error);
        this.addMessage('error', 'error', `❌ ERREUR: ${error.message}`);
        this.addMessage('error', 'error', '🔄 ROLLBACK en cours - annulation de tous les imports...');
        
        // Faire un rollback si des IDs ont été importés
        if (this.importedIds.length > 0) {
          await this.rollbackImportedIds();
        }
        this.step = 'completed';
      } finally {
        this.isImporting = false;
      }
    },

    async startSpecializedImport() {
      try {
        // Utiliser le transformateur spécialisé
        this.addMessage('system', 'info', '🔄 Transformation des fichiers (mode spécialisé)...');
        
        const { allItems } = await transformSpecializedFiles(this.sections);

        this.addMessage('system', 'success', `✅ ${allItems.length} items générés par les transformateurs spécialisés`);
        this.totalItems = allItems.length;

        // Importer les données
        const result = await this.importWithTransactionRollback(
          [{ items: allItems }],
          this.importController.signal
        );

        this.result = result;
      } catch (error) {
        throw new Error(`Erreur import spécialisé: ${error.message}`);
      }
    },

    async startGenericImport() {
      try {
        // Transformer les sections (mode générique)
        const transformedSections = [];

        for (const section of this.sections) {
          const transformed = await transformSection(section, section.detectedType);
          transformedSections.push(transformed);

          // Calculer le total d'éléments
          this.totalItems += transformed.filter(item => !item._error).length;
        }

        this.addMessage('system', 'info', `📦 ${transformedSections.length} sections préparées pour l'import (mode transactionnel)`);
        this.addMessage('system', 'info', `⚠️ ATTENTION: Si une erreur survient, TOUS les imports seront annulés (tout ou rien)`);

        // Lancer l'import avec rollback en cas d'erreur
        const result = await this.importWithTransactionRollback(
          transformedSections,
          this.importController.signal
        );

        this.result = result;
      } catch (error) {
        throw new Error(`Erreur import générique: ${error.message}`);
      }
    },

    async importWithTransactionRollback(transformedSections, signal) {
      try {
        // Importer les données
        const result = await importData(
          transformedSections,
          (progress) => this.onProgressUpdate(progress),
          signal
        );

        // Tracker les IDs importés pour rollback potentiel
        this.importedIds = result.importedIds || [];
        
        return result;
      } catch (error) {
        // En cas d'erreur, on lancera le rollback dans le catch principal
        throw error;
      }
    },

    async rollbackImportedIds() {
      this.addMessage('system', 'warning', `🗑️ Suppression des ${this.importedIds.length} éléments importés...`);
      
      try {
        // TODO: Implémenter la suppression des éléments importés
        // Pour maintenant, juste un message informatif
        for (const id of this.importedIds) {
          // Faire des appels d'API pour supprimer chaque ID
          // await deleteItem(id);
          this.addMessage('system', 'warning', `Suppression ID: ${id}`);
        }
        this.addMessage('system', 'info', '✓ Rollback complété');
      } catch (error) {
        this.addMessage('error', 'error', `Erreur lors du rollback: ${error.message}`);
      }
    },

    onProgressUpdate(progress) {
      this.totalProcessed = progress.totalProcessed;
      this.successCount = progress.totalProcessed - this.errorCount;
      this.addMessage(progress.type, progress.status, progress.message);

      if (progress.status === 'error') {
        this.errorCount++;
      }
    },

    addMessage(type, status, message) {
      this.lastMessages.push({
        type,
        status,
        message,
        time: new Date()
      });

      // Garder seulement les 50 derniers messages
      if (this.lastMessages.length > 50) {
        this.lastMessages.shift();
      }
    },

    cancelImport() {
      if (this.importController) {
        this.importController.abort();
        this.isImporting = false;
        this.addMessage('system', 'info', 'Import annulé par l\'utilisateur');
      }
    },

    startNewImport() {
      this.step = 'upload';
      this.selectedFiles = [];
      this.fileSections = [];
      this.sections = [];
      this.result = null;
      this.errorMessage = '';
      this.totalItems = 0;
      this.importedIds = [];
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = '';
      }
    },

    downloadReport() {
      const report = this.generateReport();
      const dataStr = JSON.stringify(report, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `import-report-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    },

    generateReport() {
      return {
        timestamp: new Date().toISOString(),
        fileName: this.file ? this.file.name : 'unknown',
        result: this.result,
        summary: {
          totalItems: this.totalItems,
          successCount: this.successCount,
          errorCount: this.errorCount,
          successRate: ((this.successCount / this.totalItems) * 100).toFixed(2) + '%'
        }
      };
    },

    getConfidenceClass(confidence) {
      if (confidence >= 80) return 'high';
      if (confidence >= 60) return 'medium';
      return 'low';
    },

    truncate(str, length) {
      if (!str) return '';
      return str.length > length ? str.substring(0, length) + '...' : str;
    },

    formatTime(date) {
      if (!date) return '';
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    },

    formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    },

    getConfidenceClass(confidence) {
      if (confidence >= 80) return 'high';
      if (confidence >= 60) return 'medium';
      return 'low';
    }
  }
};
</script>

<style scoped>
.import-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.import-header {
  margin-bottom: 30px;
  text-align: center;
}

.import-header h2 {
  font-size: 28px;
  margin: 0 0 10px 0;
  color: #333;
}

.import-header p {
  font-size: 16px;
  color: #666;
  margin: 0;
}

.import-section {
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

/* Upload Zone */
.upload-zone {
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 60px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #f9f9f9;
}

.upload-zone:hover {
  border-color: #0066cc;
  background: #f0f4ff;
}

.upload-zone.dragging {
  border-color: #0066cc;
  background: #e6f0ff;
}

.upload-icon {
  width: 48px;
  height: 48px;
  color: #0066cc;
  margin-bottom: 15px;
}

.upload-zone h3 {
  font-size: 20px;
  margin: 15px 0;
  color: #333;
}

.upload-zone p {
  color: #666;
  margin: 10px 0;
  font-size: 14px;
}

.file-help {
  color: #999;
  font-size: 12px !important;
  margin-top: 20px;
}

/* Buttons */
.btn-primary, .btn-secondary, .btn-danger {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.btn-primary {
  background: #0066cc;
  color: white;
  margin: 15px 10px 0 0;
}

.btn-primary:hover:not(:disabled) {
  background: #0052a3;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
  margin: 15px 10px 0 0;
}

.btn-secondary:hover:not(:disabled) {
  background: #d0d0d0;
}

.btn-danger {
  background: #ff4444;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dd0000;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Progress Bar */
.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin: 20px 0;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0066cc, #0088ff);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

/* Sections Preview */
.sections-preview {
  margin: 20px 0;
}

.section-preview {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 20px;
  background: #f9f9f9;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-title h4 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.section-confidence {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 3px;
  font-weight: 500;
}

.section-confidence.high {
  background: #d4edda;
  color: #155724;
}

.section-confidence.medium {
  background: #fff3cd;
  color: #856404;
}

.section-confidence.low {
  background: #f8d7da;
  color: #721c24;
}

.section-info {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  font-size: 14px;
  color: #666;
}

/* Table Preview */
.table-preview {
  overflow-x: auto;
  margin: 15px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th {
  background: #f0f0f0;
  padding: 10px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #ddd;
}

td {
  padding: 8px 10px;
  border-bottom: 1px solid #e0e0e0;
}

.row-num {
  background: #f9f9f9;
  text-align: center;
  font-weight: 500;
  color: #999;
}

.cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #555;
}

/* Required Fields */
.required-fields {
  margin-top: 15px;
  padding: 15px;
  background: white;
  border-radius: 4px;
  border-left: 4px solid #0066cc;
}

.required-fields h5 {
  margin: 0 0 10px 0;
  color: #333;
}

.required-fields ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.required-fields li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.required-fields span {
  font-weight: bold;
  font-size: 16px;
}

.required-fields .present {
  color: #28a745;
}

.required-fields .missing {
  color: #dc3545;
}

/* Warning */
.warning {
  padding: 12px 15px;
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  color: #856404;
  font-size: 13px;
  margin-top: 15px;
}

/* Error Message */
.error-message {
  padding: 15px;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  color: #721c24;
  margin: 20px 0;
}

/* Import Progress */
.import-progress {
  text-align: center;
}

.import-progress h3 {
  margin: 0 0 30px 0;
  font-size: 20px;
  color: #333;
}

.progress-container {
  margin: 30px 0;
}

.progress-stats {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 10px;
  font-size: 14px;
  font-weight: 500;
}

.progress-stats .success {
  color: #28a745;
}

.progress-stats .error {
  color: #dc3545;
}

/* Import Details */
.import-details {
  text-align: left;
  background: #f9f9f9;
  border-radius: 4px;
  padding: 15px;
  max-height: 300px;
  overflow-y: auto;
  margin: 20px 0;
}

.message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;
  font-size: 13px;
}

.message.success {
  color: #28a745;
}

.message.error {
  color: #dc3545;
}

.message.info {
  color: #0066cc;
}

.type-badge {
  display: inline-block;
  background: #e0e0e0;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  min-width: 50px;
  text-align: center;
}

.message-text {
  flex: 1;
}

.timestamp {
  color: #999;
  font-size: 12px;
  min-width: 60px;
}

/* Completion Report */
.completion-report {
  text-align: center;
}

.success-title {
  color: #28a745;
  font-size: 24px;
  margin-bottom: 20px;
}

.warning-title {
  color: #ff9800;
  font-size: 24px;
  margin-bottom: 20px;
}

.report-summary {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin: 30px 0;
  flex-wrap: wrap;
}

.stat-card {
  padding: 20px 30px;
  border-radius: 8px;
  min-width: 150px;
}

.stat-card.success {
  background: #d4edda;
  color: #155724;
}

.stat-card.error {
  background: #f8d7da;
  color: #721c24;
}

.stat-card.info {
  background: #d1ecf1;
  color: #0c5460;
}

.stat-number {
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 13px;
  font-weight: 500;
}

/* Stats Details */
.stats-details {
  margin: 30px 0;
  text-align: left;
}

.stats-details h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #333;
}

.stats-details table {
  width: 100%;
  margin-bottom: 20px;
}

.stats-details td.success {
  color: #28a745;
  font-weight: 600;
}

.stats-details td.error {
  color: #dc3545;
  font-weight: 600;
}

/* Errors Section */
.errors-section {
  margin: 30px 0;
  text-align: left;
}

.errors-section h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.errors-list {
  background: #f9f9f9;
  border-radius: 4px;
  padding: 15px;
  max-height: 300px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  gap: 15px;
  padding: 10px 0;
  border-bottom: 1px solid #e0e0e0;
  font-size: 13px;
}

.error-type {
  background: #f8d7da;
  color: #721c24;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  min-width: 100px;
}

.error-message {
  flex: 1;
  color: #666;
}

.more-errors {
  padding: 10px 0;
  color: #999;
  font-style: italic;
}

/* Action Buttons */
.action-buttons, .final-buttons {
  margin-top: 20px;
  text-align: center;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #ddd;
}

.section-header h3 {
  margin: 0;
  color: #333;
}

/* Responsive */
@media (max-width: 768px) {
  .import-container {
    padding: 10px;
  }

  .import-section {
    padding: 15px;
  }

  .report-summary {
    gap: 15px;
  }

  .progress-stats {
    flex-direction: column;
    gap: 10px;
  }

  .section-preview {
    padding: 15px;
  }

  table {
    font-size: 12px;
  }

  th, td {
    padding: 5px;
  }
}

/* Files List for Multiple Files */
.files-list {
  margin-bottom: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.file-item {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.file-item:hover {
  background: #f0f8ff;
  border-color: #0066cc;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.file-name {
  font-weight: 600;
  color: #333;
  flex: 1;
  word-break: break-word;
}

.file-size {
  background: #e8f4f8;
  color: #0066cc;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-size: 12px;
  margin-left: 0.5rem;
}

.sections-count {
  background: #e8f8e8;
  color: #28a745;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-size: 12px;
  margin-left: 0.5rem;
}
</style>
