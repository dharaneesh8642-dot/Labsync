# LabSync Chemical Reagents & Colorimetric Classification Dataset

This directory contains the edge-AI colorimetric dataset for presumptive narcotics field-testing used by the **LabSync** offline verification engine.

---

## 📁 Directory Contents

| File | Description |
| :--- | :--- |
| `reagents_dataset.json` | Master JSON dataset loaded directly by the mobile app's edge classification engine. |
| `reagents_dataset.csv` | Master CSV dataset for easy editing in Microsoft Excel, Google Sheets, or LibreOffice. |
| `sample_test_images/` | Pre-calibrated sample field-test images for instant testing without a physical test kit. |

---

## 🧪 Scientific & Legal Foundation

Presumptive chemical spot tests rely on specific color reactions between field reagents and suspected psychoactive substances, based on forensic standards:
1. **UNODC** (United Nations Office on Drugs and Crime) *Rapid Testing Methods of Drugs of Abuse* (ST/NAR/40).
2. **DC Dept. of Forensic Sciences (DFS)** *Standard Operating Procedure for Chemical Color Tests (FCS10)*.
3. **SWGDRUG** (Scientific Working Group for the Analysis of Seized Drugs) Guidelines.
4. **Bharatiya Sakshya Adhiniyam, 2023 (BSA)** Section 63 (Admissibility of electronic records and tamper-evident hash validation).

---

## 📊 Dataset Schema

Each entry in `reagents_dataset.json` or `reagents_dataset.csv` contains the following fields:

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `id` | string | Unique chemical-reagent pair identifier | `marquis_heroin` |
| `reagent_kit` | string | Reagent test kit family | `Marquis`, `Scott`, `Duquenois-Levine`, `Mecke` |
| `target_substance` | string | Primary suspected controlled substance | `Heroin (Diacetylmorphine)` |
| `drug_class` | string | NDPS Drug Category / Schedule | `Opioid / Narcotic Analgesic` |
| `expected_color_name` | string | Visual colour descriptor in field lighting | `Deep Reddish Purple / Violet` |
| `target_hex` | string | Calibrated hex color under 6500K standard illuminant | `#5E1242` |
| `target_rgb` | object/array | Standard sRGB color tuple `[R, G, B]` | `[94, 18, 66]` |
| `target_lab` | object/array | CIELAB values `[L*, a*, b*]` for lighting invariant matching | `[22.4, 38.6, -11.2]` |
| `delta_e_tolerance` | number | CIEDE2000 ΔE acceptance threshold (typically 12 - 18) | `16.0` |
| `reaction_time_sec` | number | Optimal time window for reading reaction (seconds) | `15` |
| `presumptive_verdict` | string | Result classification | `POSITIVE` |
| `confidence_weight` | number | Weight for out-of-distribution evaluation (0.0 to 1.0) | `0.95` |
| `notes` | string | Cross-reaction notes & safety warnings | `Fentanyl may produce faint orange turning to brown.` |

---

## 🛠️ How to Add Your Own Data from Websites or Papers

You can add any new test, kit, or substance color in 3 easy ways:

### Method 1: Edit `reagents_dataset.json` directly
Add a new object to the `substances` array:
```json
{
  "id": "ehrlich_psilocybin",
  "reagent_kit": "Ehrlich",
  "target_substance": "Psilocybin / Psilocin (Mushrooms)",
  "drug_class": "Hallucinogen / Tryptamine",
  "expected_color_name": "Purple to Violet",
  "target_hex": "#6A0DAD",
  "target_rgb": [106, 13, 173],
  "target_lab": [26.8, 52.1, -55.4],
  "delta_e_tolerance": 15.0,
  "reaction_time_sec": 45,
  "presumptive_verdict": "POSITIVE",
  "confidence_weight": 0.92,
  "notes": "Reacts with indoles. Confirmatory FSL testing needed."
}
```

### Method 2: Edit `reagents_dataset.csv`
Open `reagents_dataset.csv` in Excel, add rows with hex and RGB codes, and export as CSV. The mobile app contains a CSV import button in the **Dataset Manager** tab.

### Method 3: In the LabSync Mobile App UI
1. Launch the LabSync prototype.
2. Go to the **Dataset** tab in the bottom navigation.
3. Click **"+ Add Custom Substance"** or **"Import JSON/CSV File"**.
4. Test with your camera immediately! All custom entries are persisted in offline storage.
