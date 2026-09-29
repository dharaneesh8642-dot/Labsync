/**
 * LabSync Edge-AI Color Science & Colorimetric Classification Engine
 * Converts RGB to CIELAB, computes CIEDE2000 / Euclidean Delta-E,
 * and matches extracted colors against the forensic reagent dataset.
 */

// Convert sRGB to linear RGB
function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Convert sRGB to CIEXYZ (D65 standard illuminant, 2-degree observer)
export function rgbToXyz(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  const z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

  // Normalize for D65 reference white
  return {
    x: (x * 100) / 95.047,
    y: (y * 100) / 100.000,
    z: (z * 100) / 108.883
  };
}

// Helper for XYZ to LAB
function fLab(t) {
  const delta = 6 / 29;
  return t > Math.pow(delta, 3) ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

// Convert CIEXYZ to CIELAB
export function xyzToLab(x, y, z) {
  const fx = fLab(x);
  const fy = fLab(y);
  const fz = fLab(z);

  const L = Math.max(0, 116 * fy - 16);
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return [parseFloat(L.toFixed(2)), parseFloat(a.toFixed(2)), parseFloat(b.toFixed(2))];
}

// Direct sRGB to CIELAB [L*, a*, b*]
export function rgbToLab(r, g, b) {
  const { x, y, z } = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

// Convert Hex to RGB [r, g, b]
export function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Convert RGB to Hex string
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

/**
 * Standard CIE76 Delta-E (Euclidean distance in CIELAB)
 */
export function deltaE76(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * CIEDE2000 (ΔE00) Color Difference Formula
 * Modern international forensic standard for color difference matching
 */
export function deltaE00(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const avgL = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1Prime = (1 + G) * a1;
  const a2Prime = (1 + G) * a2;

  const C1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const C2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);
  const avgCPrime = (C1Prime + C2Prime) / 2;

  const h1Prime = (Math.atan2(b1, a1Prime) * 180 / Math.PI + 360) % 360;
  const h2Prime = (Math.atan2(b2, a2Prime) * 180 / Math.PI + 360) % 360;

  let avghPrime;
  if (Math.abs(h1Prime - h2Prime) > 180) {
    avghPrime = (h1Prime + h2Prime + 360) / 2;
  } else {
    avghPrime = (h1Prime + h2Prime) / 2;
  }

  const T = 1 - 0.17 * Math.cos((avghPrime - 30) * Math.PI / 180)
            + 0.24 * Math.cos((2 * avghPrime) * Math.PI / 180)
            + 0.32 * Math.cos((3 * avghPrime + 6) * Math.PI / 180)
            - 0.20 * Math.cos((4 * avghPrime - 63) * Math.PI / 180);

  let deltahPrime = h2Prime - h1Prime;
  if (Math.abs(deltahPrime) > 180) {
    if (h2Prime <= h1Prime) {
      deltahPrime += 360;
    } else {
      deltahPrime -= 360;
    }
  }

  const deltaLPrime = L2 - L1;
  const deltaCPrime = C2Prime - C1Prime;
  const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin((deltahPrime / 2) * Math.PI / 180);

  const SL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCPrime;
  const SH = 1 + 0.015 * avgCPrime * T;

  const deltaTheta = 30 * Math.exp(-Math.pow((avghPrime - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(avgCPrime, 7) / (Math.pow(avgCPrime, 7) + Math.pow(25, 7)));
  const RT = -Math.sin((2 * deltaTheta) * Math.PI / 180) * RC;

  const dE = Math.sqrt(
    Math.pow(deltaLPrime / SL, 2) +
    Math.pow(deltaCPrime / SC, 2) +
    Math.pow(deltaHPrime / SH, 2) +
    RT * (deltaCPrime / SC) * (deltaHPrime / SH)
  );

  return parseFloat(dE.toFixed(2));
}

/**
 * Classify a measured RGB color against the reagent library
 * @param {Array<number>} measuredRgb - [r, g, b]
 * @param {string} selectedKit - Marquis, Scott, Duquenois-Levine, or "Any"
 * @param {Array<Object>} dataset - List of substance entries
 * @param {Object} options - Calibration options (whiteBalanceFactor, luxLevel)
 */
export function classifyColor(measuredRgb, selectedKit, dataset, options = {}) {
  const { whiteBalance = [1, 1, 1], lux = 450 } = options;

  // Apply white-balance correction matrix simulation if needed
  const correctedRgb = [
    Math.min(255, Math.round(measuredRgb[0] * whiteBalance[0])),
    Math.min(255, Math.round(measuredRgb[1] * whiteBalance[1])),
    Math.min(255, Math.round(measuredRgb[2] * whiteBalance[2]))
  ];

  const measuredLab = rgbToLab(...correctedRgb);
  const measuredHex = rgbToHex(...correctedRgb);

  // Filter candidates by reagent kit if selected (or include generic blanks)
  const candidates = dataset.filter(item => {
    if (!selectedKit || selectedKit === 'Any' || item.reagent_kit === 'Any') return true;
    return item.reagent_kit.toLowerCase() === selectedKit.toLowerCase();
  });

  // Score all candidates
  const scoredMatches = candidates.map(substance => {
    const targetLab = substance.target_lab || rgbToLab(...(substance.target_rgb || hexToRgb(substance.target_hex)));
    const dE00 = deltaE00(measuredLab, targetLab);
    const dE76 = deltaE76(measuredLab, targetLab);
    const tolerance = substance.delta_e_tolerance || 16.0;

    // Confidence formula: 100% when dE=0, dropping down towards threshold
    let confidence = 0;
    if (dE00 <= tolerance) {
      confidence = Math.max(10, Math.round(100 - (dE00 / tolerance) * 45));
    } else {
      confidence = Math.max(0, Math.round(55 - ((dE00 - tolerance) / tolerance) * 50));
    }

    return {
      substance,
      deltaE: dE00,
      deltaE76: parseFloat(dE76.toFixed(2)),
      tolerance,
      confidence,
      isWithinTolerance: dE00 <= tolerance
    };
  });

  // Sort by lowest Delta-E
  scoredMatches.sort((a, b) => a.deltaE - b.deltaE);

  const bestMatch = scoredMatches[0];

  // Out-of-distribution & Lighting Quality checks
  let finalVerdict = 'INCONCLUSIVE';
  let verdictReason = '';

  if (lux < 80) {
    finalVerdict = 'INCONCLUSIVE';
    verdictReason = 'Environmental lux level too low (< 80 lx). Lighting cast prevents reliable colorimetric reading. Turn on torch or move to illuminated area.';
  } else if (!bestMatch || !bestMatch.isWithinTolerance) {
    finalVerdict = 'INCONCLUSIVE';
    verdictReason = `Sample spectral signature (ΔE = ${bestMatch ? bestMatch.deltaE : 'N/A'}) exceeds the calibrated acceptance tolerance band. Suspected mixed compound, unknown adulterant, or false chromophore. Mandatory laboratory FSL confirmation required under NDPS s.52A.`;
  } else {
    finalVerdict = bestMatch.substance.presumptive_verdict;
    if (finalVerdict === 'POSITIVE') {
      verdictReason = `Edge-AI verified match with ${bestMatch.substance.target_substance} under ${bestMatch.substance.reagent_kit} reagent (ΔE00: ${bestMatch.deltaE}, Tolerance: ${bestMatch.tolerance}). Conforms to presumptive field testing criteria.`;
    } else {
      verdictReason = `Negative control / non-reactive result detected (${bestMatch.substance.target_substance}). No presumptive psychoactive chromophore observed.`;
    }
  }

  return {
    measuredRgb,
    correctedRgb,
    measuredLab,
    measuredHex,
    verdict: finalVerdict,
    confidence: bestMatch ? bestMatch.confidence : 0,
    bestMatch: bestMatch ? bestMatch.substance : null,
    deltaE: bestMatch ? bestMatch.deltaE : 999,
    verdictReason,
    rankedMatches: scoredMatches.slice(0, 4),
    timestamp: new Date().toISOString()
  };
}
