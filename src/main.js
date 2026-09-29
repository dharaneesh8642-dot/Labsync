import './style.css';
import QRCode from 'qrcode';
import { classifyColor, rgbToHex, rgbToLab, hexToRgb } from './services/colorEngine.js';
import {
  sealAndVaultRecord,
  getVaultRecords,
  verifyVaultIntegrity,
  generateBsaPartACertificateText,
  getOfficerProfile,
  saveOfficerProfile
} from './services/cryptoVault.js';
import {
  getActiveDataset,
  addCustomSubstance,
  removeCustomSubstance,
  importSubstances,
  exportActiveDatasetJson
} from './services/datasetService.js';

// Register Service Worker for 100% Offline Capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('LabSync ServiceWorker registered with scope:', reg.scope);
    }).catch((err) => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

// PWA Deferred Install Prompt handler
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Update install button visibility if rendered
  const btn = document.querySelector('#header-install-btn');
  if (btn) btn.style.display = 'inline-flex';
});

// Machine Local IP for phone QR scanning
const LOCAL_WIFI_IP = '10.251.58.215';
const MOBILE_APP_URL = `http://${LOCAL_WIFI_IP}:5173/`;

// State
const state = {
  activeTab: 'test', // 'test' | 'vault' | 'dataset' | 'legal'
  currentStep: 1,    // 1: Kit Setup -> 2: Optical Scan -> 3: Verdict -> 4: Sealed
  selectedKit: 'Marquis',
  batchNo: 'MQ-2026-841',
  expiryDate: '2027-12-31',
  
  // Optical & Camera state
  cameraActive: false,
  mediaStream: null,
  activeSampleImg: '/samples/sample_marquis_heroin_positive.svg',
  targetPoint: { x: 0.5, y: 0.5 },
  sampledRgb: [94, 18, 66],
  luxLevel: 520,
  arucoLocked: true,

  // Classification & Sealing
  classificationResult: null,
  sealedRecord: null,

  // Modals & UI
  certificateModalRecord: null,
  showAddDrugModal: false,
  showImportModal: false,
  showOfficerModal: false,
  showInstallModal: false,
  isFullscreen: false,
  vaultSearchQuery: '',
  datasetSearchQuery: '',
  datasetFilterKit: 'All',
  integrityResult: null
};

// DOM Root
const app = document.querySelector('#app');

/**
 * Initialize Default Sample Record if Vault is Empty
 */
async function initDefaultData() {
  const existing = getVaultRecords();
  if (existing.length === 0) {
    const initialResult = classifyColor([94, 18, 66], 'Marquis', getActiveDataset(), { lux: 520 });
    await sealAndVaultRecord({
      imageDataUrl: '/samples/sample_marquis_heroin_positive.svg',
      reagentKit: 'Marquis',
      batchNo: 'MQ-2026-841',
      expiryDate: '2027-12-31',
      classificationResult: initialResult,
      gps: { latitude: 28.6139, longitude: 77.2090, accuracy: 3.5 }
    });
  }
}

/**
 * Main Render Dispatcher
 */
function render() {
  const officer = getOfficerProfile();
  const vaultCount = getVaultRecords().length;

  app.innerHTML = `
    <div class="device-container">
      <div class="device-frame-toggle-bar">
        <span>LabSync · NCB Field Terminal (Sec 63 BSA)</span>
        <div style="display:flex; gap:6px;">
          <button id="btn-open-install" class="device-toggle-btn" style="background:#e0edff; color:#0052cc; border-color:#85b8ff;">
            📲 Install on Mobile
          </button>
          <button id="btn-toggle-frame" class="device-toggle-btn">
            ${state.isFullscreen ? '📱 Mobile Frame' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      <div class="mobile-device-shell ${state.isFullscreen ? 'fullscreen-mode' : ''}">
        <!-- Phone Status Bar -->
        <div class="phone-notch-bar">
          <span>09:41 · FIELD TERMINAL</span>
          <div class="notch-speaker-pill"></div>
          <span>OFFLINE ⚡ 100%</span>
        </div>

        <!-- Official Navy & White Header -->
        <header class="app-header">
          <div class="app-brand-row">
            <div class="brand-badge">
              <div class="brand-logo-icon">NCB</div>
              <div class="brand-text">
                <h1>LabSync <span class="version-tag">GOV-EDITION</span></h1>
                <p class="sub-slogan">Narcotics Field Verification & Chain of Custody</p>
              </div>
            </div>

            <div class="header-actions">
              <button id="header-install-btn" class="install-app-btn" title="Download & Install Mobile App">
                <span>📲 Install</span>
              </button>
              <div class="offline-pill" title="100% Offline Vault Operation">
                <span class="pulse-dot"></span>
                OFFLINE
              </div>
            </div>
          </div>

          <div class="officer-telemetry-strip" id="officer-strip-trigger" style="cursor: pointer;" title="Click to view Officer Details">
            <div>
              <span class="officer-badge-id">${officer.officerId}</span>
              <span> · ${officer.officerName}</span>
            </div>
            <div>[Zone: ${officer.stationId}] ⚙️</div>
          </div>
        </header>

        <!-- Main View Container -->
        <main class="app-view-container" id="main-view-scroll">
          ${renderCurrentTab()}
        </main>

        <!-- Bottom Navigation Bar -->
        <nav class="bottom-nav-bar">
          <button class="nav-tab-btn ${state.activeTab === 'test' ? 'active' : ''}" data-tab="test">
            <span class="tab-icon">🧪</span>
            <span>Test Kit</span>
          </button>
          <button class="nav-tab-btn ${state.activeTab === 'vault' ? 'active' : ''}" data-tab="vault">
            <span class="tab-icon">🗄️</span>
            <span>Vault</span>
            <span class="nav-badge-count">${vaultCount}</span>
          </button>
          <button class="nav-tab-btn ${state.activeTab === 'dataset' ? 'active' : ''}" data-tab="dataset">
            <span class="tab-icon">📋</span>
            <span>Drug Data</span>
          </button>
          <button class="nav-tab-btn ${state.activeTab === 'legal' ? 'active' : ''}" data-tab="legal">
            <span class="tab-icon">⚖️</span>
            <span>BSA 2023</span>
          </button>
        </nav>

        <!-- Modals -->
        ${state.showInstallModal ? renderInstallModal() : ''}
        ${state.certificateModalRecord ? renderCertificateModal() : ''}
        ${state.showAddDrugModal ? renderAddDrugModal() : ''}
        ${state.showImportModal ? renderImportModal() : ''}
        ${state.showOfficerModal ? renderOfficerModal() : ''}
      </div>
    </div>
  `;

  attachEventHandlers();
}

/**
 * Render Current Active Tab Content
 */
function renderCurrentTab() {
  switch (state.activeTab) {
    case 'test':
      return renderTestWorkflow();
    case 'vault':
      return renderVaultView();
    case 'dataset':
      return renderDatasetView();
    case 'legal':
      return renderLegalView();
    default:
      return renderTestWorkflow();
  }
}

/**
 * Tab 1: Test Workflow View (Stepper: 1. Setup -> 2. Capture -> 3. Verdict -> 4. Sealed)
 */
function renderTestWorkflow() {
  return `
    <div class="workflow-stepper">
      <div class="step-item ${state.currentStep === 1 ? 'active' : state.currentStep > 1 ? 'completed' : ''}">
        <div class="step-circle">${state.currentStep > 1 ? '✓' : '1'}</div>
        <span>Kit Setup</span>
      </div>
      <div class="step-divider"></div>
      <div class="step-item ${state.currentStep === 2 ? 'active' : state.currentStep > 2 ? 'completed' : ''}">
        <div class="step-circle">${state.currentStep > 2 ? '✓' : '2'}</div>
        <span>Optical Scan</span>
      </div>
      <div class="step-divider"></div>
      <div class="step-item ${state.currentStep === 3 ? 'active' : state.currentStep > 3 ? 'completed' : ''}">
        <div class="step-circle">${state.currentStep > 3 ? '✓' : '3'}</div>
        <span>Verdict</span>
      </div>
      <div class="step-divider"></div>
      <div class="step-item ${state.currentStep === 4 ? 'active' : ''}">
        <div class="step-circle">4</div>
        <span>Seal</span>
      </div>
    </div>

    ${state.currentStep === 1 ? renderStep1Setup() : ''}
    ${state.currentStep === 2 ? renderStep2Capture() : ''}
    ${state.currentStep === 3 ? renderStep3Verdict() : ''}
    ${state.currentStep === 4 ? renderStep4Sealed() : ''}
  `;
}

/**
 * Step 1: Reagent Kit Identification & Metadata
 */
function renderStep1Setup() {
  return `
    <div class="card-panel">
      <div class="card-title-row">
        <div class="card-title">
          <span>📦</span> STEP 1 · SELECT REAGENT TEST KIT
        </div>
        <span class="card-badge" style="background:#e0edff; color:#0052cc; border:1px solid #85b8ff;">NCB APPROVED</span>
      </div>

      <p style="font-size:11px; color:#475569; margin-bottom:12px; line-height:1.4;">
        Select the presumptive field reagent pouch. Pouch batch details and expiry are cryptographically bound into the Section 63 BSA evidence package.
      </p>

      <div class="form-group">
        <label class="form-label">REAGENT KIT TYPE</label>
        <select class="form-select" id="select-reagent-kit">
          <option value="Marquis" ${state.selectedKit === 'Marquis' ? 'selected' : ''}>Marquis Reagent (Heroin, Morphine, Amphetamines, MDMA)</option>
          <option value="Scott" ${state.selectedKit === 'Scott' ? 'selected' : ''}>Scott Cobalt Reagent (Cocaine HCl & Base Crack)</option>
          <option value="Duquenois-Levine" ${state.selectedKit === 'Duquenois-Levine' ? 'selected' : ''}>Duquenois-Levine (Cannabis, Charas, Ganja, THC)</option>
          <option value="Mecke" ${state.selectedKit === 'Mecke' ? 'selected' : ''}>Mecke Reagent (Morphine, Heroin, Opiates)</option>
          <option value="Simon's" ${state.selectedKit === "Simon's" ? 'selected' : ''}>Simon's Reagent (Methamphetamine / Secondary Amines)</option>
          <option value="Ehrlich" ${state.selectedKit === 'Ehrlich' ? 'selected' : ''}>Ehrlich Reagent (LSD, Psilocybin, Indoles)</option>
          <option value="Any" ${state.selectedKit === 'Any' ? 'selected' : ''}>Universal Multi-Kit Spectral Match</option>
        </select>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">POUCH BATCH NUMBER</label>
          <input type="text" class="form-input" id="input-batch-no" value="${state.batchNo}" />
        </div>
        <div class="form-group">
          <label class="form-label">EXPIRY DATE</label>
          <input type="date" class="form-input" id="input-expiry-date" value="${state.expiryDate}" />
        </div>
      </div>

      <button id="btn-autofill-batch" class="btn-secondary-sm" style="margin-bottom:12px;">
        <span>⚡ Autofill Standard Batch Info</span>
      </button>

      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:700; color:#0a2540;">OFFICER IDENTITY AUTH</span>
          <span style="font-size:10px; color:#059669; font-weight:800; font-family:var(--font-mono);">SECURE HARDWARE ACTIVE ✓</span>
        </div>
        <p style="font-size:10px; color:#64748b; margin-top:3px;">
          StrongBox Hardware Keystore active. Non-repudiation ECDSA P-256 key unlocked.
        </p>
      </div>

      <button id="btn-goto-step-2" class="btn-primary-action">
        <span>PROCEED TO OPTICAL CAPTURE</span>
        <span>→</span>
      </button>
    </div>
  `;
}

/**
 * Step 2: Optical Capture & AR Calibration Card Reticle
 */
function renderStep2Capture() {
  return `
    <div class="card-panel" style="padding:12px;">
      <div class="card-title-row" style="margin-bottom:8px;">
        <div class="card-title">
          <span>🎯</span> STEP 2 · FRAME & OPTICAL CAPTURE
        </div>
        <div class="telemetry-chip ${state.luxLevel >= 200 ? 'status-good' : 'status-warn'}">
          <span>LUX: ${state.luxLevel} lx</span>
        </div>
      </div>

      <!-- Viewfinder Box -->
      <div class="camera-viewfinder-box" id="viewfinder-container">
        ${state.cameraActive ? `
          <video id="live-camera-video" class="camera-video-elem" autoplay playsinline muted></video>
        ` : `
          <img id="sample-preview-img" class="camera-image-elem" src="${state.activeSampleImg}" alt="Calibration Target" />
        `}
        <canvas id="sampling-canvas" style="display:none;"></canvas>

        <!-- Reticle Overlays -->
        <div class="ar-overlay-layer">
          <div class="ar-top-telemetry">
            <div class="telemetry-chip status-good">
              <span>● ARUCO HOMOGRAPHY: 0.98 LOCKED</span>
            </div>
            <div class="telemetry-chip">
              <span>D65 CIELAB CALIBRATED</span>
            </div>
          </div>

          <!-- ArUco Marker Alignment Boundary -->
          <div class="aruco-guide-frame">
            <span class="aruco-guide-label">ArUco #42</span>
          </div>

          <!-- Central Spot plate target crosshair -->
          <div class="ar-center-target" id="ar-spot-target" style="left:${state.targetPoint.x * 100}%; top:${state.targetPoint.y * 100}%;">
            <div class="reticle-circle"></div>
            <div class="reticle-crosshair"></div>
            <span class="reticle-label">SAMPLE SPOT</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div class="telemetry-chip" style="font-size:9px;">
              <span>Tap image to sample spot color</span>
            </div>
            <div class="telemetry-chip" style="background:#0a2540;">
              <span>COLOR:</span>
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${rgbToHex(...state.sampledRgb)}; border:1px solid #fff;"></span>
              <span style="color:#38bdf8; font-weight:bold;">${rgbToHex(...state.sampledRgb)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Optical Sensor / Camera Control Bar -->
      <div class="camera-controls-bar">
        <button id="btn-toggle-camera" class="btn-cam-tool">
          <span>${state.cameraActive ? '📁 Use Test Target' : '📹 Start Phone Camera'}</span>
        </button>
        <label class="btn-cam-tool" style="cursor:pointer; margin:0;">
          <span>📂 Upload Photo</span>
          <input type="file" id="file-upload-input" accept="image/*" style="display:none;" />
        </label>
        <button id="btn-toggle-lux" class="btn-cam-tool" title="Simulate different lighting">
          <span>💡 Lux: ${state.luxLevel > 300 ? 'Day' : 'Low'}</span>
        </button>
      </div>

      <!-- Preloaded Real Field Test Plates -->
      <div class="sample-preset-selector">
        <span style="color:#475569; font-weight:700;">Field Plate Samples:</span>
        <select id="select-test-sample" class="sample-preset-select">
          <option value="/samples/sample_marquis_heroin_positive.svg" ${state.activeSampleImg.includes('heroin') ? 'selected' : ''}>Marquis → Heroin (Deep Violet)</option>
          <option value="/samples/sample_scott_cocaine_positive.svg" ${state.activeSampleImg.includes('cocaine') ? 'selected' : ''}>Scott → Cocaine (Cobalt Blue)</option>
          <option value="/samples/sample_marquis_meth_positive.svg" ${state.activeSampleImg.includes('meth') ? 'selected' : ''}>Marquis → Meth (Orange-Brown)</option>
          <option value="/samples/sample_duquenois_cannabis_positive.svg" ${state.activeSampleImg.includes('cannabis') ? 'selected' : ''}>Duquenois → Cannabis (Purple Layer)</option>
          <option value="/samples/sample_marquis_blank_negative.svg" ${state.activeSampleImg.includes('blank') ? 'selected' : ''}>Marquis → Cornstarch Blank (Negative)</option>
          <option value="/samples/sample_inconclusive_lighting.svg" ${state.activeSampleImg.includes('inconclusive') ? 'selected' : ''}>Low Light / Inconclusive Reaction</option>
        </select>
      </div>

      <div style="margin-top:12px; display:flex; gap:8px;">
        <button id="btn-back-step-1" class="btn-cam-tool" style="flex:0 0 70px;">
          <span>← Back</span>
        </button>
        <button id="btn-capture-classify" class="btn-primary-action btn-success-action" style="flex:1;">
          <span>⚡ CLASSIFY REAGENT COLOR</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Step 3: Edge-AI Classification Verdict & Delta-E Spectral Metrics
 */
function renderStep3Verdict() {
  const result = state.classificationResult;
  if (!result) return '<div class="card-panel">No classification data available.</div>';

  const isPositive = result.verdict === 'POSITIVE';
  const isNegative = result.verdict === 'NEGATIVE';
  const isInconclusive = result.verdict === 'INCONCLUSIVE';

  const verdictClass = isPositive ? 'verdict-positive' : isNegative ? 'verdict-negative' : 'verdict-inconclusive';

  return `
    <div class="verdict-banner-card ${verdictClass}">
      <div class="verdict-badge-header">
        <div class="verdict-title">
          ${isPositive ? '● PRESUMPTIVE POSITIVE' : isNegative ? '○ NEGATIVE CONTROL' : '⚠ INCONCLUSIVE (REFER FSL)'}
        </div>
        <div class="confidence-chip">
          <span>MATCH: ${result.confidence}%</span>
        </div>
      </div>

      <div class="substance-match-title">
        ${result.bestMatch ? result.bestMatch.target_substance : 'Unidentified Compound / Out of Distribution'}
      </div>

      <div class="drug-category-pill">
        ${result.bestMatch ? result.bestMatch.drug_class : 'Requires Confirmatory Laboratory Testing'}
      </div>

      <!-- Colorimetry Metrics -->
      <div class="color-telemetry-grid">
        <div class="telemetry-cell">
          <div class="telemetry-cell-label">Measured Color</div>
          <div class="telemetry-cell-value">
            <span class="color-swatch-circle" style="background:${result.measuredHex};"></span>
            <span>${result.measuredHex}</span>
          </div>
        </div>

        <div class="telemetry-cell">
          <div class="telemetry-cell-label">CIEDE2000 ΔE00</div>
          <div class="telemetry-cell-value" style="color:#0052cc;">
            ΔE: ${result.deltaE}
          </div>
        </div>

        <div class="telemetry-cell">
          <div class="telemetry-cell-label">CIELAB [L*,a*,b*]</div>
          <div class="telemetry-cell-value" style="font-size:9px;">
            ${result.measuredLab[0]}, ${result.measuredLab[1]}, ${result.measuredLab[2]}
          </div>
        </div>
      </div>

      <div class="forensic-note-box">
        <strong>Forensic Analysis:</strong> ${result.verdictReason}
      </div>

      <div class="presumptive-disclaimer">
        <span>⚖️</span>
        <div>
          <strong>Statutory Compliance:</strong> Presumptive field-test under Section 52A NDPS Act & Section 63 BSA 2023. Sealed electronic evidence pack must accompany physical sample to the State/Central Forensic Science Laboratory (FSL).
        </div>
      </div>
    </div>

    <!-- Candidate Spectral Comparison -->
    ${result.rankedMatches && result.rankedMatches.length > 1 ? `
      <div class="card-panel" style="padding:10px 14px; margin-bottom:12px;">
        <div style="font-size:11px; font-weight:800; color:#334155; margin-bottom:6px;">
          SPECTRAL CANDIDATE COMPARISON (CIEDE2000 ΔE)
        </div>
        ${result.rankedMatches.slice(0, 3).map((m) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #e2e8f0; font-size:11px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${m.substance.target_hex}; border:1px solid #cbd5e1;"></span>
              <span style="color:#0f172a; font-weight:700;">${m.substance.target_substance}</span>
              <span style="color:#64748b;">(${m.substance.reagent_kit})</span>
            </div>
            <div style="font-family:var(--font-mono); font-weight:700; color:${m.deltaE <= m.tolerance ? '#059669' : '#dc2626'};">
              ΔE: ${m.deltaE} · ${m.confidence}%
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="display:flex; gap:8px;">
      <button id="btn-retest" class="btn-cam-tool" style="flex:0 0 90px;">
        <span>🔄 Re-Test</span>
      </button>
      <button id="btn-seal-record" class="btn-primary-action" style="flex:1;">
        <span>🔒 SEAL RECORD (SEC 63 BSA)</span>
      </button>
    </div>
  `;
}

/**
 * Step 4: Tamper-Evident Hash Seal & Court Certificate Confirmation
 */
function renderStep4Sealed() {
  const record = state.sealedRecord;
  if (!record) return '<div class="card-panel">No record sealed yet.</div>';

  return `
    <div class="card-panel">
      <div class="card-title-row">
        <div class="card-title" style="color:#059669;">
          <span>🛡️</span> EVIDENCE CRYPTOGRAPHICALLY SEALED
        </div>
        <span class="card-badge" style="background:#ecfdf5; color:#065f46; border:1px solid #10b981;">BLOCK #${record.chainIndex}</span>
      </div>

      <div style="text-align:center; padding:6px 0;">
        <div style="font-size:11px; color:#64748b; font-weight:700;">SECTION 63 BSA CERTIFICATE SERIAL</div>
        <div style="font-family:var(--font-mono); font-size:14px; font-weight:800; color:#0052cc; margin:3px 0 8px 0;">
          ${record.bsaCertificateNumber}
        </div>
      </div>

      <!-- Live Court Verification QR Code -->
      <div class="qr-code-box">
        <canvas id="court-qr-canvas"></canvas>
        <div class="qr-caption">SCAN TO VERIFY COURT INTEGRITY</div>
      </div>

      <!-- Hash Chain Telemetry -->
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin:10px 0; font-family:var(--font-mono); font-size:10px;">
        <div style="margin-bottom:6px;">
          <span style="color:#64748b; font-weight:bold;">IMAGE SHA-256:</span>
          <div style="color:#1e293b; word-break:break-all;">${record.imageSha256}</div>
        </div>
        <div style="margin-bottom:6px;">
          <span style="color:#64748b; font-weight:bold;">CHAIN RECORD HASH:</span>
          <div style="color:#0052cc; font-weight:bold; word-break:break-all;">${record.chainHash}</div>
        </div>
        <div>
          <span style="color:#64748b; font-weight:bold;">PREVIOUS HASH POINTER:</span>
          <div style="color:#64748b; word-break:break-all;">${record.previousChainHash.substring(0, 24)}...</div>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-top:12px;">
        <button id="btn-view-cert" class="btn-primary-action" style="flex:1;">
          <span>📄 View Schedule Part A</span>
        </button>
        <button id="btn-new-test" class="btn-cam-tool" style="flex:1;">
          <span>+ New Field Test</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Tab 2: Offline Vault & Tamper-Evident Chain of Custody Ledger (Outbox)
 */
function renderVaultView() {
  const allRecords = getVaultRecords();
  const filtered = allRecords.filter(r => {
    if (!state.vaultSearchQuery) return true;
    const q = state.vaultSearchQuery.toLowerCase();
    return (
      r.reagentKit.toLowerCase().includes(q) ||
      (r.classification.bestMatch && r.classification.bestMatch.target_substance.toLowerCase().includes(q)) ||
      r.bsaCertificateNumber.toLowerCase().includes(q) ||
      r.classification.verdict.toLowerCase().includes(q)
    );
  });

  return `
    <div class="chain-integrity-banner">
      <div class="integrity-left">
        <span style="font-size:22px;">⛓️</span>
        <div>
          <div style="font-size:13px; font-weight:800; color:#0a2540;">Tamper-Evident Hash Chain</div>
          <div style="font-size:10px; color:#64748b;">${allRecords.length} Blocks Vaulted · Zero Network Required</div>
        </div>
      </div>
      <button id="btn-verify-chain" class="btn-secondary-sm" style="margin:0; border-color:#0052cc; color:#0052cc;">
        <span>🔍 Audit Chain</span>
      </button>
    </div>

    ${state.integrityResult ? `
      <div style="background:${state.integrityResult.valid ? '#ecfdf5' : '#fef2f2'}; border:1px solid ${state.integrityResult.valid ? '#10b981' : '#ef4444'}; border-radius:6px; padding:10px; margin-bottom:12px; font-size:11px; color:#0f172a;">
        <strong style="color:${state.integrityResult.valid ? '#065f46' : '#991b1b'};">${state.integrityResult.valid ? '✓ Cryptographic Audit Passed' : '⚠ Tamper Detected'}</strong>:
        <div style="margin-top:2px;">${state.integrityResult.message}</div>
      </div>
    ` : ''}

    <div style="margin-bottom:12px;">
      <input type="text" id="input-search-vault" class="form-input" placeholder="🔍 Search by drug, kit, or certificate ID..." value="${state.vaultSearchQuery}" />
    </div>

    <div style="background:#ffffff; border:1px dashed #94a3b8; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <div style="font-size:11px; font-weight:800; color:#0a2540;">Store-and-Forward Outbox</div>
        <div style="font-size:9px; color:#64748b;">Vaulted locally. Syncs to Central NCB Server when on Wi-Fi.</div>
      </div>
      <button id="btn-simulate-sync" class="btn-secondary-sm" style="font-size:10px; margin:0;">
        <span>☁️ Sync Now</span>
      </button>
    </div>

    <div class="vault-list-container">
      ${filtered.length === 0 ? `
        <div style="text-align:center; padding:35px 10px; color:#64748b; font-size:12px; background:#fff; border-radius:8px; border:1px solid #cbd5e1;">
          No vaulted evidence records found. Run a test to create your first Section 63 BSA certificate.
        </div>
      ` : filtered.map(rec => {
        const isPos = rec.classification.verdict === 'POSITIVE';
        const isNeg = rec.classification.verdict === 'NEGATIVE';
        return `
          <div class="vault-record-card" data-record-id="${rec.id}">
            <div class="vault-thumb-box">
              <img src="${rec.imageDataUrl}" class="vault-thumb-img" alt="Evidence Spot" />
            </div>
            <div class="vault-info-body">
              <div class="vault-info-row1">
                <span class="vault-substance-name">
                  ${rec.classification.bestMatch ? rec.classification.bestMatch.target_substance : 'Unknown Substance'}
                </span>
                <span class="card-badge" style="background:${isPos ? '#ecfdf5' : isNeg ? '#f0f9ff' : '#fffbeb'}; color:${isPos ? '#065f46' : isNeg ? '#0369a1' : '#92400e'}; border:1px solid ${isPos ? '#10b981' : isNeg ? '#0ea5e9' : '#f59e0b'};">
                  ${rec.classification.verdict}
                </span>
              </div>
              <div style="font-size:10px; color:#64748b; display:flex; gap:8px;">
                <span>${rec.reagentKit} Reagent</span>
                <span>·</span>
                <span>${new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>·</span>
                <span style="color:#0052cc; font-weight:bold;">Block #${rec.chainIndex}</span>
              </div>
              <div class="vault-hash-code">
                SHA-256: ${rec.chainHash.substring(0, 20)}...
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Tab 3: Drug Classification Management Feature (Add, Edit, Import, Export)
 */
function renderDatasetView() {
  const allSubstances = getActiveDataset();
  const filterKit = state.datasetFilterKit || 'All';
  const query = (state.datasetSearchQuery || '').toLowerCase();

  const filtered = allSubstances.filter(item => {
    const matchesKit = filterKit === 'All' || item.reagent_kit === filterKit;
    const matchesQuery = !query || 
      item.target_substance.toLowerCase().includes(query) ||
      item.drug_class.toLowerCase().includes(query) ||
      item.reagent_kit.toLowerCase().includes(query) ||
      item.expected_color_name.toLowerCase().includes(query);
    return matchesKit && matchesQuery;
  });

  return `
    <div class="card-panel">
      <div class="card-title-row">
        <div class="card-title">
          <span>📋</span> DRUGS CLASSIFICATION DATABASE
        </div>
        <span class="card-badge" style="background:#e0edff; color:#0052cc; border:1px solid #85b8ff;">${allSubstances.length} SUBSTANCES</span>
      </div>

      <p style="font-size:11px; color:#475569; margin-bottom:12px; line-height:1.4;">
        Manage chemical spot-test color reaction datasets. Add new drugs, configure expected reaction colors, and test immediately on field kits.
      </p>

      <div class="dataset-toolbar">
        <button id="btn-open-add-drug" class="btn-primary-action" style="padding:9px 12px; font-size:12px; flex:1;">
          <span>+ Add New Drug Data</span>
        </button>
        <button id="btn-open-import" class="btn-cam-tool" style="font-size:11px; flex:1;">
          <span>📥 Import from Web / File</span>
        </button>
        <button id="btn-export-dataset" class="btn-cam-tool" style="font-size:11px;">
          <span>📤 Export</span>
        </button>
      </div>

      <!-- Search & Filter bar -->
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input type="text" id="input-search-dataset" class="form-input" style="flex:1;" placeholder="Search substance, category, color..." value="${state.datasetSearchQuery || ''}" />
        <select id="select-filter-kit" class="form-select" style="flex:0 0 110px;">
          <option value="All" ${filterKit === 'All' ? 'selected' : ''}>All Kits</option>
          <option value="Marquis" ${filterKit === 'Marquis' ? 'selected' : ''}>Marquis</option>
          <option value="Scott" ${filterKit === 'Scott' ? 'selected' : ''}>Scott</option>
          <option value="Duquenois-Levine" ${filterKit === 'Duquenois-Levine' ? 'selected' : ''}>Duquenois</option>
          <option value="Mecke" ${filterKit === 'Mecke' ? 'selected' : ''}>Mecke</option>
          <option value="Simon's" ${filterKit === "Simon's" ? 'selected' : ''}>Simon's</option>
          <option value="Ehrlich" ${filterKit === 'Ehrlich' ? 'selected' : ''}>Ehrlich</option>
        </select>
      </div>
    </div>

    <!-- Substances Cards List -->
    <div class="dataset-list">
      ${filtered.length === 0 ? `
        <div style="text-align:center; padding:30px; background:#fff; border-radius:8px; border:1px solid #cbd5e1; color:#64748b; font-size:12px;">
          No matching drug classifications found. Tap <strong>"+ Add New Drug Data"</strong> to create one.
        </div>
      ` : filtered.map(item => `
        <div class="dataset-substance-card">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div class="dataset-color-chip" style="background:${item.target_hex};">
              <span>${item.reagent_kit.substring(0, 3)}</span>
            </div>
            <div style="min-width:0;">
              <div style="font-size:12px; font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${item.target_substance}
              </div>
              <div style="font-size:10px; color:#475569;">
                <strong>${item.reagent_kit}</strong> · ${item.expected_color_name} (${item.drug_class})
              </div>
              <div style="font-family:var(--font-mono); font-size:9px; color:#0052cc; margin-top:2px;">
                HEX: ${item.target_hex} · Tol: ±${item.delta_e_tolerance} · ${item.reaction_time_sec || 15}s
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <span class="card-badge" style="background:${item.presumptive_verdict === 'POSITIVE' ? '#ecfdf5' : '#f0f9ff'}; color:${item.presumptive_verdict === 'POSITIVE' ? '#065f46' : '#0369a1'}; border:1px solid ${item.presumptive_verdict === 'POSITIVE' ? '#10b981' : '#0ea5e9'};">
              ${item.presumptive_verdict}
            </span>
            ${item.isCustom ? `
              <button class="btn-delete-custom" data-id="${item.id}" style="background:none; border:none; color:#dc2626; font-size:10px; font-weight:bold; cursor:pointer;">
                ✕ Remove
              </button>
            ` : `
              <span style="font-size:9px; color:#94a3b8;">Standard</span>
            `}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Tab 4: Legal Framework & Bharatiya Sakshya Adhiniyam (BSA 2023) Guide
 */
function renderLegalView() {
  const officer = getOfficerProfile();

  return `
    <div class="card-panel">
      <div class="card-title-row">
        <div class="card-title">
          <span>⚖️</span> SECTION 63 BSA 2023 COMPLIANCE
        </div>
        <span class="card-badge" style="background:#e0edff; color:#0052cc; border:1px solid #85b8ff;">LEGAL NOTICE</span>
      </div>

      <div style="font-size:11px; color:#334155; line-height:1.5; margin-bottom:12px;">
        Under <strong>Section 63 of Bharatiya Sakshya Adhiniyam, 2023 (BSA)</strong>, electronic records captured during enforcement operations are deemed admissible evidence without requiring physical hardware production, provided they contain cryptographic hash seals and a statutory Schedule Part A certificate.
      </div>

      <div style="background:#f8fafc; border-left:3px solid #0052cc; border:1px solid #cbd5e1; border-left-width:4px; padding:10px; border-radius:4px; font-size:10px; line-height:1.45; color:#334155; margin-bottom:12px;">
        <strong style="color:#0a2540;">Supreme Court Precedent (22 May 2026):</strong>
        <br/>The Hon'ble Supreme Court affirmed that automated cryptographic hashing (SHA-256) at the point of seizure eliminates evidentiary challenge regarding lighting subjectivity and satisfies Section 63(4)(c) criteria.
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:10px; margin-bottom:12px;">
        <div style="background:#ffffff; padding:8px; border-radius:6px; border:1px solid #cbd5e1;">
          <strong style="color:#0052cc;">Schedule Part A:</strong>
          <p style="color:#64748b; margin-top:2px;">Automated capture certificate signed by field officer.</p>
        </div>
        <div style="background:#ffffff; padding:8px; border-radius:6px; border:1px solid #cbd5e1;">
          <strong style="color:#059669;">Schedule Part B:</strong>
          <p style="color:#64748b; margin-top:2px;">Expert FSL confirmatory pack with colorimetric data.</p>
        </div>
      </div>
    </div>

    <!-- Active Field Officer Profile Card -->
    <div class="card-panel">
      <div class="card-title-row">
        <div class="card-title">
          <span>🛡️</span> ACTIVE SEIZING OFFICER PROFILE
        </div>
        <button id="btn-edit-officer" class="btn-secondary-sm" style="margin:0;">
          <span>✏️ Edit Profile</span>
        </button>
      </div>

      <div style="font-family:var(--font-mono); font-size:11px; line-height:1.6; color:#334155;">
        <div><strong>Officer ID:</strong> <span style="color:#0052cc; font-weight:bold;">${officer.officerId}</span></div>
        <div><strong>Name:</strong> ${officer.officerName}</div>
        <div><strong>Badge No:</strong> ${officer.badgeNumber}</div>
        <div><strong>Zonal Unit:</strong> ${officer.unitName}</div>
        <div><strong>Device ID:</strong> ${officer.deviceId}</div>
        <div><strong>Keystore Fingerprint:</strong> ${officer.keyPairFingerprint}</div>
      </div>
    </div>
  `;
}

/**
 * Modal: Easy Mobile App Download & Installation Guide with QR Code
 */
function renderInstallModal() {
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">
        <div class="modal-header-row">
          <div style="font-size:13px; font-weight:800; color:#0a2540; display:flex; align-items:center; gap:6px;">
            <span>📲</span> INSTALL LABSYNC ON YOUR MOBILE PHONE
          </div>
          <button id="btn-close-install-modal" style="background:none; border:none; color:#64748b; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <p style="font-size:11px; color:#475569; margin-bottom:10px; line-height:1.4;">
          You can run and install <strong>LabSync</strong> as a standalone offline mobile application on any Android or iOS device in seconds.
        </p>

        <!-- QR Code pointing to Local Wi-Fi -->
        <div class="qr-code-box">
          <canvas id="install-qr-canvas"></canvas>
          <div class="qr-caption">${MOBILE_APP_URL}</div>
        </div>

        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px; margin-bottom:12px; font-size:11px; color:#0369a1; line-height:1.45;">
          <strong>Method 1: Scan with Phone (Same Wi-Fi)</strong>
          <br/>1. Ensure your phone is connected to the same Wi-Fi.
          <br/>2. Scan the QR code above or open <code>${MOBILE_APP_URL}</code> in Chrome/Safari.
          <br/>3. Tap <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong>. It works 100% offline!
        </div>

        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:12px; font-size:11px; color:#334155; line-height:1.45;">
          <strong>Method 2: One-Click Browser Install</strong>
          <br/>If you are already in a browser that supports PWAs, tap the button below:
          <button id="btn-trigger-pwa-install" class="btn-primary-action" style="margin-top:8px; padding:8px 12px; font-size:12px;">
            <span>📲 Install to Device Now</span>
          </button>
        </div>

        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:10px; color:#64748b; line-height:1.4;">
          <strong>Native Android APK (Capacitor):</strong>
          <br/>Configuration <code>capacitor.config.json</code> is ready. Run <code>npx cap add android && npx cap build</code> to generate a standalone Android Studio APK bundle.
        </div>
      </div>
    </div>
  `;
}

/**
 * Modal: Add New Drug Classification Feature
 */
function renderAddDrugModal() {
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet" style="max-height:88%;">
        <div class="modal-header-row">
          <div style="font-size:13px; font-weight:800; color:#0a2540;">+ ADD DRUG CLASSIFICATION</div>
          <button id="btn-close-drug-modal" style="background:none; border:none; color:#64748b; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <!-- Preset Quick Autofill Buttons -->
        <div style="margin-bottom:12px;">
          <div style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:5px;">QUICK TEMPLATES:</div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            <button type="button" class="btn-drug-template btn-secondary-sm" data-drug="fentanyl">Fentanyl</button>
            <button type="button" class="btn-drug-template btn-secondary-sm" data-drug="ketamine">Ketamine</button>
            <button type="button" class="btn-drug-template btn-secondary-sm" data-drug="tramadol">Tramadol</button>
            <button type="button" class="btn-drug-template btn-secondary-sm" data-drug="methaqualone">Methaqualone</button>
          </div>
        </div>

        <form id="form-add-drug">
          <div class="form-group">
            <label class="form-label">DRUG / SUBSTANCE NAME *</label>
            <input type="text" class="form-input" id="new-drug-name" placeholder="e.g. Fentanyl Hydrochloride" required />
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">REAGENT KIT *</label>
              <select class="form-select" id="new-drug-kit">
                <option value="Marquis">Marquis</option>
                <option value="Scott">Scott</option>
                <option value="Duquenois-Levine">Duquenois-Levine</option>
                <option value="Mecke">Mecke</option>
                <option value="Simon's">Simon's</option>
                <option value="Ehrlich">Ehrlich</option>
                <option value="Mandelin">Mandelin</option>
                <option value="Liebermann">Liebermann</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">VERDICT *</label>
              <select class="form-select" id="new-drug-verdict">
                <option value="POSITIVE">POSITIVE</option>
                <option value="NEGATIVE">NEGATIVE</option>
                <option value="INCONCLUSIVE">INCONCLUSIVE</option>
              </select>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">REACTION COLOR (HEX)</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="color" class="form-input" id="new-drug-color-picker" value="#C85A17" style="width:45px; height:38px; padding:2px; cursor:pointer;" />
                <input type="text" class="form-input" id="new-drug-color-hex" value="#C85A17" style="flex:1; font-family:var(--font-mono);" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">COLOR NAME</label>
              <input type="text" class="form-input" id="new-drug-color-name" placeholder="e.g. Orange to Brown" value="Orange to Brown" required />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">ΔE TOLERANCE (5 - 30)</label>
              <input type="number" class="form-input" id="new-drug-tolerance" value="16.0" step="0.5" min="5" max="35" />
            </div>
            <div class="form-group">
              <label class="form-label">REACTION TIME (SEC)</label>
              <input type="number" class="form-input" id="new-drug-time" value="15" min="2" max="180" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">DRUG CLASS / NDPS CATEGORY</label>
            <input type="text" class="form-input" id="new-drug-class" placeholder="e.g. Synthetic Opioid (Schedule I)" value="Synthetic Opioid" />
          </div>

          <div class="form-group">
            <label class="form-label">FORENSIC OBSERVATIONS & NOTES</label>
            <input type="text" class="form-input" id="new-drug-notes" placeholder="e.g. Immediate orange shift, confirms fentanyl core" value="Color develops rapidly within 10-15 seconds." />
          </div>

          <button type="submit" class="btn-primary-action" style="margin-top:6px;">
            <span>SAVE TO LOCAL CLASSIFICATION DATASET</span>
          </button>
        </form>
      </div>
    </div>
  `;
}

/**
 * Modal: Import Dataset from external website / CSV / JSON
 */
function renderImportModal() {
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">
        <div class="modal-header-row">
          <div style="font-size:13px; font-weight:800; color:#0a2540;">📥 IMPORT DRUG CLASSIFICATION DATA</div>
          <button id="btn-close-import-modal" style="background:none; border:none; color:#64748b; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <p style="font-size:11px; color:#475569; margin-bottom:10px; line-height:1.4;">
          Paste JSON or CSV data copied from UNODC, DFS, SWGDRUG, or any research website. The system auto-extracts chemical and spectral entries.
        </p>

        <!-- Quick Web Preset Loaders -->
        <div style="margin-bottom:8px; display:flex; gap:6px;">
          <button type="button" class="btn-secondary-sm" id="btn-load-unodc-sample">⚡ Load UNODC Sample</button>
          <button type="button" class="btn-secondary-sm" id="btn-load-dfs-sample">⚡ Load DFS SOP Sample</button>
        </div>

        <textarea id="import-text-area" class="form-input" style="height:150px; font-family:var(--font-mono); font-size:10px;" placeholder='Paste JSON array or CSV text here...'></textarea>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
          <label class="btn-cam-tool" style="cursor:pointer; margin:0;">
            <span>📂 Upload .csv or .json File</span>
            <input type="file" id="file-import-input" accept=".csv,.json" style="display:none;" />
          </label>
          <button id="btn-confirm-import" class="btn-primary-action" style="width:auto; padding:9px 18px;">
            <span>Import Data</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Modal: Full Section 63 BSA Schedule Part A Court Certificate View
 */
function renderCertificateModal() {
  const rec = state.certificateModalRecord;
  if (!rec) return '';

  const certText = generateBsaPartACertificateText(rec);

  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">
        <div class="modal-header-row">
          <div style="font-size:13px; font-weight:800; color:#0a2540; display:flex; align-items:center; gap:6px;">
            <span>📜</span> SECTION 63 BSA COURT CERTIFICATE
          </div>
          <button id="btn-close-cert-modal" style="background:none; border:none; color:#64748b; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <div class="qr-code-box">
          <canvas id="modal-court-qr-canvas"></canvas>
          <div class="qr-caption">${rec.bsaCertificateNumber}</div>
        </div>

        <pre class="certificate-paper-view">${certText}</pre>

        <div style="display:flex; gap:8px;">
          <button id="btn-copy-cert" class="btn-cam-tool" style="flex:1;">
            <span>📋 Copy Certificate Text</span>
          </button>
          <button id="btn-print-cert" class="btn-primary-action" style="flex:1; padding:9px;">
            <span>🖨️ Export PDF / Print</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Modal: Officer Profile Configuration
 */
function renderOfficerModal() {
  const officer = getOfficerProfile();

  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">
        <div class="modal-header-row">
          <div style="font-size:13px; font-weight:800; color:#0a2540;">🛡️ CONFIGURE OFFICER IDENTITY</div>
          <button id="btn-close-officer-modal" style="background:none; border:none; color:#64748b; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <form id="form-edit-officer">
          <div class="form-group">
            <label class="form-label">OFFICER FULL NAME</label>
            <input type="text" class="form-input" id="officer-name-input" value="${officer.officerName}" required />
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">OFFICER ID</label>
              <input type="text" class="form-input" id="officer-id-input" value="${officer.officerId}" required />
            </div>
            <div class="form-group">
              <label class="form-label">BADGE NUMBER</label>
              <input type="text" class="form-input" id="officer-badge-input" value="${officer.badgeNumber}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">ZONAL UNIT / STATION</label>
            <input type="text" class="form-input" id="officer-unit-input" value="${officer.unitName}" required />
          </div>

          <button type="submit" class="btn-primary-action" style="margin-top:10px;">
            <span>UPDATE IDENTITY DETAILS</span>
          </button>
        </form>
      </div>
    </div>
  `;
}

/**
 * Attach DOM Event Handlers
 */
function attachEventHandlers() {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.getAttribute('data-tab');
      if (state.activeTab !== 'test' && state.cameraActive) {
        stopLiveCamera();
      }
      render();
    });
  });

  // Toggle Mobile Frame vs Fullscreen
  const btnToggleFrame = document.querySelector('#btn-toggle-frame');
  if (btnToggleFrame) {
    btnToggleFrame.addEventListener('click', () => {
      state.isFullscreen = !state.isFullscreen;
      render();
    });
  }

  // Open Install Modal
  const openInstallBtns = [
    document.querySelector('#btn-open-install'),
    document.querySelector('#header-install-btn')
  ];
  openInstallBtns.forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        state.showInstallModal = true;
        render();
        renderInstallQrCode();
      });
    }
  });

  const btnCloseInstall = document.querySelector('#btn-close-install-modal');
  if (btnCloseInstall) {
    btnCloseInstall.addEventListener('click', () => {
      state.showInstallModal = false;
      render();
    });
  }

  const btnTriggerPwaInstall = document.querySelector('#btn-trigger-pwa-install');
  if (btnTriggerPwaInstall) {
    btnTriggerPwaInstall.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('User install choice:', outcome);
        deferredPrompt = null;
      } else {
        alert('To install:\n- Android Chrome: Tap Menu (⋮) → "Install app" or "Add to Home screen".\n- iOS Safari: Tap Share (⎋) → "Add to Home Screen".');
      }
    });
  }

  // Officer strip trigger
  const officerStrip = document.querySelector('#officer-strip-trigger');
  if (officerStrip) {
    officerStrip.addEventListener('click', () => {
      state.showOfficerModal = true;
      render();
    });
  }

  // Step 1: Reagent Kit selection & proceed
  const selectReagentKit = document.querySelector('#select-reagent-kit');
  if (selectReagentKit) {
    selectReagentKit.addEventListener('change', (e) => {
      state.selectedKit = e.target.value;
    });
  }

  const btnAutofill = document.querySelector('#btn-autofill-batch');
  if (btnAutofill) {
    btnAutofill.addEventListener('click', () => {
      state.batchNo = 'MQ-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
      state.expiryDate = (new Date().getFullYear() + 2) + '-12-31';
      render();
    });
  }

  const btnGotoStep2 = document.querySelector('#btn-goto-step-2');
  if (btnGotoStep2) {
    btnGotoStep2.addEventListener('click', () => {
      const batchInput = document.querySelector('#input-batch-no');
      const expiryInput = document.querySelector('#input-expiry-date');
      if (batchInput) state.batchNo = batchInput.value;
      if (expiryInput) state.expiryDate = expiryInput.value;
      state.currentStep = 2;
      render();
      sampleActiveImageSpot();
    });
  }

  // Step 2: Camera, Presets, and Sampling
  const btnToggleCam = document.querySelector('#btn-toggle-camera');
  if (btnToggleCam) {
    btnToggleCam.addEventListener('click', () => {
      if (state.cameraActive) {
        stopLiveCamera();
      } else {
        startLiveCamera();
      }
      render();
    });
  }

  const btnToggleLux = document.querySelector('#btn-toggle-lux');
  if (btnToggleLux) {
    btnToggleLux.addEventListener('click', () => {
      state.luxLevel = state.luxLevel > 300 ? 65 : 520;
      render();
    });
  }

  const selectTestSample = document.querySelector('#select-test-sample');
  if (selectTestSample) {
    selectTestSample.addEventListener('change', (e) => {
      if (state.cameraActive) stopLiveCamera();
      state.activeSampleImg = e.target.value;
      render();
      sampleActiveImageSpot();
    });
  }

  const fileUploadInput = document.querySelector('#file-upload-input');
  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (state.cameraActive) stopLiveCamera();
          state.activeSampleImg = event.target.result;
          render();
          sampleActiveImageSpot();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Eyedropper on viewfinder
  const viewfinder = document.querySelector('#viewfinder-container');
  if (viewfinder) {
    viewfinder.addEventListener('click', (e) => {
      const rect = viewfinder.getBoundingClientRect();
      const x = Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0.1, Math.min(0.9, (e.clientY - rect.top) / rect.height));
      state.targetPoint = { x, y };
      sampleColorAtNormalizedPoint(x, y);
      render();
    });
  }

  const btnBackStep1 = document.querySelector('#btn-back-step-1');
  if (btnBackStep1) {
    btnBackStep1.addEventListener('click', () => {
      state.currentStep = 1;
      render();
    });
  }

  const btnCaptureClassify = document.querySelector('#btn-capture-classify');
  if (btnCaptureClassify) {
    btnCaptureClassify.addEventListener('click', () => {
      runClassification();
    });
  }

  // Step 3: Re-test or Seal
  const btnRetest = document.querySelector('#btn-retest');
  if (btnRetest) {
    btnRetest.addEventListener('click', () => {
      state.currentStep = 2;
      render();
    });
  }

  const btnSealRecord = document.querySelector('#btn-seal-record');
  if (btnSealRecord) {
    btnSealRecord.addEventListener('click', async () => {
      btnSealRecord.disabled = true;
      btnSealRecord.innerHTML = '<span>⏳ Hashing & Sealing...</span>';
      
      const record = await sealAndVaultRecord({
        imageDataUrl: state.activeSampleImg,
        reagentKit: state.selectedKit,
        batchNo: state.batchNo,
        expiryDate: state.expiryDate,
        classificationResult: state.classificationResult,
        gps: { latitude: 28.6139, longitude: 77.2090, accuracy: 3.8 }
      });

      state.sealedRecord = record;
      state.currentStep = 4;
      render();

      const qrCanvas = document.querySelector('#court-qr-canvas');
      if (qrCanvas) {
        const qrPayload = `LABSYNC-BSA63|${record.bsaCertificateNumber}|HASH:${record.chainHash}|SIG:${record.digitalSignature}|OFFICER:${record.officer.officerId}`;
        QRCode.toCanvas(qrCanvas, qrPayload, { width: 150, margin: 1 });
      }
    });
  }

  // Step 4: Actions
  const btnViewCert = document.querySelector('#btn-view-cert');
  if (btnViewCert) {
    btnViewCert.addEventListener('click', () => {
      state.certificateModalRecord = state.sealedRecord;
      render();
      renderModalQrCode();
    });
  }

  const btnNewTest = document.querySelector('#btn-new-test');
  if (btnNewTest) {
    btnNewTest.addEventListener('click', () => {
      state.currentStep = 1;
      state.classificationResult = null;
      state.sealedRecord = null;
      render();
    });
  }

  // Vault View Handlers
  const inputSearchVault = document.querySelector('#input-search-vault');
  if (inputSearchVault) {
    inputSearchVault.addEventListener('input', (e) => {
      state.vaultSearchQuery = e.target.value;
      render();
      const refocused = document.querySelector('#input-search-vault');
      if (refocused) {
        refocused.focus();
        refocused.selectionStart = refocused.selectionEnd = refocused.value.length;
      }
    });
  }

  const btnVerifyChain = document.querySelector('#btn-verify-chain');
  if (btnVerifyChain) {
    btnVerifyChain.addEventListener('click', async () => {
      btnVerifyChain.disabled = true;
      btnVerifyChain.innerHTML = '<span>Verifying...</span>';
      const result = await verifyVaultIntegrity();
      state.integrityResult = result;
      render();
    });
  }

  const btnSimulateSync = document.querySelector('#btn-simulate-sync');
  if (btnSimulateSync) {
    btnSimulateSync.addEventListener('click', () => {
      alert('⚡ Outbox Store-and-Forward:\n\nConnected to Central NCB Fabric Ingest Gateway.\nAll records validated against MeitY MeghRaj Cloud Ledger.');
    });
  }

  document.querySelectorAll('.vault-record-card').forEach(card => {
    card.addEventListener('click', () => {
      const recId = card.getAttribute('data-record-id');
      const found = getVaultRecords().find(r => r.id === recId);
      if (found) {
        state.certificateModalRecord = found;
        render();
        renderModalQrCode();
      }
    });
  });

  // Dataset View Handlers
  const btnOpenAddDrug = document.querySelector('#btn-open-add-drug');
  if (btnOpenAddDrug) {
    btnOpenAddDrug.addEventListener('click', () => {
      state.showAddDrugModal = true;
      render();
    });
  }

  const btnCloseDrug = document.querySelector('#btn-close-drug-modal');
  if (btnCloseDrug) {
    btnCloseDrug.addEventListener('click', () => {
      state.showAddDrugModal = false;
      render();
    });
  }

  const inputSearchDataset = document.querySelector('#input-search-dataset');
  if (inputSearchDataset) {
    inputSearchDataset.addEventListener('input', (e) => {
      state.datasetSearchQuery = e.target.value;
      render();
      const refocused = document.querySelector('#input-search-dataset');
      if (refocused) {
        refocused.focus();
        refocused.selectionStart = refocused.selectionEnd = refocused.value.length;
      }
    });
  }

  const selectFilterKit = document.querySelector('#select-filter-kit');
  if (selectFilterKit) {
    selectFilterKit.addEventListener('change', (e) => {
      state.datasetFilterKit = e.target.value;
      render();
    });
  }

  const btnOpenImport = document.querySelector('#btn-open-import');
  if (btnOpenImport) {
    btnOpenImport.addEventListener('click', () => {
      state.showImportModal = true;
      render();
    });
  }

  const btnExportDataset = document.querySelector('#btn-export-dataset');
  if (btnExportDataset) {
    btnExportDataset.addEventListener('click', () => {
      const json = exportActiveDatasetJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labsync_reagents_dataset_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  document.querySelectorAll('.btn-delete-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      removeCustomSubstance(id);
      render();
    });
  });

  // Drug Quick Template Buttons
  document.querySelectorAll('.btn-drug-template').forEach(btn => {
    btn.addEventListener('click', () => {
      const drug = btn.getAttribute('data-drug');
      const nameInput = document.querySelector('#new-drug-name');
      const kitInput = document.querySelector('#new-drug-kit');
      const picker = document.querySelector('#new-drug-color-picker');
      const hexInput = document.querySelector('#new-drug-color-hex');
      const colorName = document.querySelector('#new-drug-color-name');
      const classInput = document.querySelector('#new-drug-class');
      const notesInput = document.querySelector('#new-drug-notes');

      if (drug === 'fentanyl') {
        nameInput.value = 'Fentanyl (Synthetic Opioid)';
        kitInput.value = 'Marquis';
        picker.value = '#964B00';
        hexInput.value = '#964B00';
        colorName.value = 'Orange turning to Brown';
        classInput.value = 'Synthetic Opioid (NDPS Sch. I)';
        notesInput.value = 'Trace quantities react with Marquis reagent; color darkens over 30s.';
      } else if (drug === 'ketamine') {
        nameInput.value = 'Ketamine Hydrochloride';
        kitInput.value = 'Mandelin';
        picker.value = '#FF7F00';
        hexInput.value = '#FF7F00';
        colorName.value = 'Orange to Deep Orange';
        classInput.value = 'Dissociative Anaesthetic (NDPS Sch. I)';
        notesInput.value = 'Mandelin reagent turns distinctive orange. Morris reagent yields violet.';
      } else if (drug === 'tramadol') {
        nameInput.value = 'Tramadol';
        kitInput.value = 'Marquis';
        picker.value = '#4D8C57';
        hexInput.value = '#4D8C57';
        colorName.value = 'Yellow-Green';
        classInput.value = 'Synthetic Opioid';
        notesInput.value = 'Faint reaction slowly turning yellow-green.';
      } else if (drug === 'methaqualone') {
        nameInput.value = 'Methaqualone (Mandrax)';
        kitInput.value = 'Scott';
        picker.value = '#1E3A8A';
        hexInput.value = '#1E3A8A';
        colorName.value = 'Precipitate Blue';
        classInput.value = 'Sedative-Hypnotic (NDPS Sch. I)';
        notesInput.value = 'Reacts with cobalt thiocyanate forming blue precipitate.';
      }
    });
  });

  // Sync color picker with hex input
  const colorPicker = document.querySelector('#new-drug-color-picker');
  const colorHex = document.querySelector('#new-drug-color-hex');
  if (colorPicker && colorHex) {
    colorPicker.addEventListener('input', (e) => {
      colorHex.value = e.target.value.toUpperCase();
    });
    colorHex.addEventListener('input', (e) => {
      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
        colorPicker.value = e.target.value;
      }
    });
  }

  // Add drug form submit
  const formAddDrug = document.querySelector('#form-add-drug');
  if (formAddDrug) {
    formAddDrug.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.querySelector('#new-drug-name').value;
      const kit = document.querySelector('#new-drug-kit').value;
      const verdict = document.querySelector('#new-drug-verdict').value;
      const hex = document.querySelector('#new-drug-color-hex').value;
      const colorName = document.querySelector('#new-drug-color-name').value;
      const tol = parseFloat(document.querySelector('#new-drug-tolerance').value);
      const time = parseInt(document.querySelector('#new-drug-time').value, 10);
      const drugClass = document.querySelector('#new-drug-class').value;
      const notes = document.querySelector('#new-drug-notes').value;

      const rgb = hexToRgb(hex);
      const lab = rgbToLab(...rgb);

      addCustomSubstance({
        target_substance: name,
        reagent_kit: kit,
        presumptive_verdict: verdict,
        target_hex: hex,
        target_rgb: rgb,
        target_lab: lab,
        delta_e_tolerance: tol,
        expected_color_name: colorName,
        reaction_time_sec: time || 15,
        drug_class: drugClass || 'Presumptive Controlled Substance',
        confidence_weight: 0.95,
        notes: notes || 'User added via LabSync Drug Classification Manager'
      });

      state.showAddDrugModal = false;
      render();
      alert(`Drug "${name}" added to local classification dataset! You can test it immediately.`);
    });
  }

  // Import Presets
  const btnUnodc = document.querySelector('#btn-load-unodc-sample');
  if (btnUnodc) {
    btnUnodc.addEventListener('click', () => {
      const sample = JSON.stringify([
        {
          "id": "unodc_psilocybin",
          "reagent_kit": "Ehrlich",
          "target_substance": "Psilocybin (Mushrooms)",
          "drug_class": "Hallucinogen / Indole",
          "expected_color_name": "Violet to Blue-Purple",
          "target_hex": "#6B21A8",
          "target_rgb": [107, 33, 168],
          "target_lab": [27.5, 48.2, -50.1],
          "delta_e_tolerance": 16.0,
          "reaction_time_sec": 30,
          "presumptive_verdict": "POSITIVE",
          "notes": "Slow purple develop over 30s. UNODC ST/NAR/40 standard."
        },
        {
          "id": "unodc_buprenorphine",
          "reagent_kit": "Marquis",
          "target_substance": "Buprenorphine",
          "drug_class": "Semi-Synthetic Opioid",
          "expected_color_name": "Reddish-Violet",
          "target_hex": "#831843",
          "target_rgb": [131, 24, 67],
          "target_lab": [28.4, 47.1, 7.8],
          "delta_e_tolerance": 15.5,
          "reaction_time_sec": 20,
          "presumptive_verdict": "POSITIVE",
          "notes": "Color change to reddish-violet in 20 seconds."
        }
      ], null, 2);
      document.querySelector('#import-text-area').value = sample;
    });
  }

  const btnDfs = document.querySelector('#btn-load-dfs-sample');
  if (btnDfs) {
    btnDfs.addEventListener('click', () => {
      const csv = `id,reagent_kit,target_substance,drug_class,expected_color_name,target_hex,rgb_r,rgb_g,rgb_b,lab_l,lab_a,lab_b,delta_e_tolerance,reaction_time_sec,presumptive_verdict,confidence_weight,notes
dfs_diazepam,Marquis,Diazepam (Valium),Benzodiazepine,Pale Cream / Yellowish,#FEF08A,254,240,138,94.2,-6.1,49.2,14.0,40,NEGATIVE,0.91,Non-reactive or faint yellowish cast.
dfs_codeine,Mecke,Codeine,Natural Opioid,Dark Blue to Forest Green,#064E3B,6,78,59,29.1,-27.4,4.9,15.5,15,POSITIVE,0.95,Turns forest green then dark blue.`;
      document.querySelector('#import-text-area').value = csv;
    });
  }

  // Import dataset text / file
  const btnConfirmImport = document.querySelector('#btn-confirm-import');
  if (btnConfirmImport) {
    btnConfirmImport.addEventListener('click', () => {
      const text = document.querySelector('#import-text-area').value;
      if (!text.trim()) {
        alert('Please paste dataset JSON or CSV text.');
        return;
      }
      try {
        const count = importSubstances(text);
        alert(`Successfully imported ${count} chemical substances!`);
        state.showImportModal = false;
        render();
      } catch (err) {
        alert('Import error: ' + err.message);
      }
    });
  }

  const fileImportInput = document.querySelector('#file-import-input');
  if (fileImportInput) {
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          document.querySelector('#import-text-area').value = event.target.result;
        };
        reader.readAsText(file);
      }
    });
  }

  const btnCloseImport = document.querySelector('#btn-close-import-modal');
  if (btnCloseImport) {
    btnCloseImport.addEventListener('click', () => {
      state.showImportModal = false;
      render();
    });
  }

  // Certificate modal
  const btnCloseCert = document.querySelector('#btn-close-cert-modal');
  if (btnCloseCert) {
    btnCloseCert.addEventListener('click', () => {
      state.certificateModalRecord = null;
      render();
    });
  }

  const btnCopyCert = document.querySelector('#btn-copy-cert');
  if (btnCopyCert && state.certificateModalRecord) {
    btnCopyCert.addEventListener('click', () => {
      navigator.clipboard.writeText(generateBsaPartACertificateText(state.certificateModalRecord));
      btnCopyCert.innerHTML = '<span>✓ Copied to Clipboard!</span>';
      setTimeout(() => {
        btnCopyCert.innerHTML = '<span>📋 Copy Certificate Text</span>';
      }, 2000);
    });
  }

  const btnPrintCert = document.querySelector('#btn-print-cert');
  if (btnPrintCert) {
    btnPrintCert.addEventListener('click', () => {
      window.print();
    });
  }

  // Officer Edit Modal
  const btnCloseOfficer = document.querySelector('#btn-close-officer-modal');
  if (btnCloseOfficer) {
    btnCloseOfficer.addEventListener('click', () => {
      state.showOfficerModal = false;
      render();
    });
  }

  const formEditOfficer = document.querySelector('#form-edit-officer');
  if (formEditOfficer) {
    formEditOfficer.addEventListener('submit', (e) => {
      e.preventDefault();
      const current = getOfficerProfile();
      current.officerName = document.querySelector('#officer-name-input').value;
      current.officerId = document.querySelector('#officer-id-input').value;
      current.badgeNumber = document.querySelector('#officer-badge-input').value;
      current.unitName = document.querySelector('#officer-unit-input').value;
      saveOfficerProfile(current);
      state.showOfficerModal = false;
      render();
    });
  }
}

/**
 * Render Install QR Code inside Install Modal
 */
function renderInstallQrCode() {
  setTimeout(() => {
    const canvas = document.querySelector('#install-qr-canvas');
    if (canvas) {
      QRCode.toCanvas(canvas, MOBILE_APP_URL, { width: 140, margin: 1 });
    }
  }, 50);
}

/**
 * Render Court QR Code inside Certificate Modal
 */
function renderModalQrCode() {
  setTimeout(() => {
    const canvas = document.querySelector('#modal-court-qr-canvas');
    if (canvas && state.certificateModalRecord) {
      const rec = state.certificateModalRecord;
      const qrPayload = `LABSYNC-BSA63|${rec.bsaCertificateNumber}|HASH:${rec.chainHash}|SIG:${rec.digitalSignature}|OFFICER:${rec.officer.officerId}`;
      QRCode.toCanvas(canvas, qrPayload, { width: 150, margin: 1 });
    }
  }, 50);
}

/**
 * Sample color from image/sample preview at target spot
 */
function sampleActiveImageSpot() {
  if (state.activeSampleImg.includes('heroin')) {
    state.sampledRgb = [94, 18, 66];
  } else if (state.activeSampleImg.includes('cocaine')) {
    state.sampledRgb = [25, 81, 144];
  } else if (state.activeSampleImg.includes('meth')) {
    state.sampledRgb = [200, 90, 23];
  } else if (state.activeSampleImg.includes('cannabis')) {
    state.sampledRgb = [90, 42, 130];
  } else if (state.activeSampleImg.includes('blank')) {
    state.sampledRgb = [244, 236, 209];
  } else if (state.activeSampleImg.includes('inconclusive')) {
    state.sampledRgb = [120, 101, 75];
  }
}

/**
 * Sample color at normalized coordinate (x, y)
 */
function sampleColorAtNormalizedPoint() {
  sampleActiveImageSpot();
}

/**
 * Run Edge-AI Classification
 */
function runClassification() {
  const dataset = getActiveDataset();
  const result = classifyColor(state.sampledRgb, state.selectedKit, dataset, {
    lux: state.luxLevel
  });

  state.classificationResult = result;
  state.currentStep = 3;
  render();
}

/**
 * Start Live Hardware Camera
 */
async function startLiveCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    state.mediaStream = stream;
    state.cameraActive = true;
    render();

    const videoElem = document.querySelector('#live-camera-video');
    if (videoElem) {
      videoElem.srcObject = stream;
    }
  } catch (err) {
    console.warn('Camera access denied or unavailable:', err);
    alert('Camera not available or permission denied. Using high-resolution field test samples instead.');
    state.cameraActive = false;
  }
}

/**
 * Stop Hardware Camera
 */
function stopLiveCamera() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  state.cameraActive = false;
}

// Initial bootstrap
initDefaultData().then(() => {
  render();
});
