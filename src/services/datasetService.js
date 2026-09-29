/**
 * LabSync Dataset Management Service
 * Manages loading, caching, custom substance insertion, and CSV/JSON import & export.
 */

import defaultDatasetJson from '../../dataset/reagents_dataset.json';

const CUSTOM_DATASET_KEY = 'labsync_custom_substances_v1';

/**
 * Get all available chemical substances (bundled + custom user added)
 */
export function getActiveDataset() {
  const baseSubstances = defaultDatasetJson.substances || [];
  try {
    const customRaw = localStorage.getItem(CUSTOM_DATASET_KEY);
    if (customRaw) {
      const customSubstances = JSON.parse(customRaw);
      return [...customSubstances, ...baseSubstances];
    }
  } catch (e) {
    console.warn('Error reading custom substances:', e);
  }
  return baseSubstances;
}

/**
 * Get user-added custom substances
 */
export function getCustomSubstances() {
  try {
    const raw = localStorage.getItem(CUSTOM_DATASET_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Add a new custom substance to the dataset
 */
export function addCustomSubstance(substance) {
  const customs = getCustomSubstances();
  const newSubstance = {
    ...substance,
    id: substance.id || 'custom_' + Date.now().toString(36),
    isCustom: true,
    addedAt: new Date().toISOString()
  };
  customs.unshift(newSubstance);
  localStorage.setItem(CUSTOM_DATASET_KEY, JSON.stringify(customs));
  return newSubstance;
}

/**
 * Remove a custom substance
 */
export function removeCustomSubstance(id) {
  const customs = getCustomSubstances().filter(s => s.id !== id);
  localStorage.setItem(CUSTOM_DATASET_KEY, JSON.stringify(customs));
}

/**
 * Parse CSV text into substance objects
 */
export function parseCsvDataset(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV must contain a header row and at least one data row.');

  const headers = lines[0].split(',').map(h => h.trim());
  const substances = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim());
    if (row.length < 5 || !row[0]) continue;

    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = row[index] !== undefined ? row[index] : '';
    });

    const parsed = {
      id: obj.id || 'imported_' + Math.random().toString(36).substr(2, 6),
      reagent_kit: obj.reagent_kit || 'General',
      target_substance: obj.target_substance || 'Unknown Substance',
      drug_class: obj.drug_class || 'Presumptive Category',
      expected_color_name: obj.expected_color_name || 'Visual Reaction',
      target_hex: obj.target_hex || '#FFFFFF',
      target_rgb: [
        parseInt(obj.rgb_r || '255', 10),
        parseInt(obj.rgb_g || '255', 10),
        parseInt(obj.rgb_b || '255', 10)
      ],
      target_lab: [
        parseFloat(obj.lab_l || '50'),
        parseFloat(obj.lab_a || '0'),
        parseFloat(obj.lab_b || '0')
      ],
      delta_e_tolerance: parseFloat(obj.delta_e_tolerance || '16.0'),
      reaction_time_sec: parseInt(obj.reaction_time_sec || '15', 10),
      presumptive_verdict: (obj.presumptive_verdict || 'POSITIVE').toUpperCase(),
      confidence_weight: parseFloat(obj.confidence_weight || '0.9'),
      notes: obj.notes || 'Imported via CSV file.',
      isCustom: true
    };
    substances.push(parsed);
  }

  return substances;
}

/**
 * Import substances from JSON or CSV text
 */
export function importSubstances(text, type = 'json') {
  let importedList = [];
  if (type === 'json' || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const data = JSON.parse(text);
    importedList = Array.isArray(data) ? data : (data.substances || []);
  } else {
    importedList = parseCsvDataset(text);
  }

  const existing = getCustomSubstances();
  const merged = [...importedList.map(s => ({ ...s, isCustom: true })), ...existing];
  localStorage.setItem(CUSTOM_DATASET_KEY, JSON.stringify(merged));
  return importedList.length;
}

/**
 * Export active dataset to JSON
 */
export function exportActiveDatasetJson() {
  const all = getActiveDataset();
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    total_records: all.length,
    substances: all
  }, null, 2);
}
