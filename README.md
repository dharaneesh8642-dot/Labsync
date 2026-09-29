# 🧪 LabSync: Offline-First Edge-AI Narcotics Field-Test Verification
### Aligned to Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA 2023) & SIH 2026

**LabSync** is a mobile application prototype designed for field officers (such as the Narcotics Control Bureau - NCB). It removes human subjectivity in reading colorimetric chemical spot tests (Marquis, Scott, Duquenois-Levine, Mecke, Simon's, etc.) and automatically produces a cryptographically hashed, tamper-evident chain of custody aligned to **Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 (BSA)**.

---

## 📱 Quick Start & Instant Mobile Installation

### Run Locally on Computer:
```bash
# 1. Install dependencies
npm install

# 2. Start the local server
npm run dev
```

- **On Computer:** Open **`http://localhost:5173/`**
- **On Mobile Phone (Instant Install):** 
  - Connect your phone to the same Wi-Fi network.
  - Open **`http://10.251.58.215:5173/`** in Chrome or Safari on your phone (or tap **"📲 Install on Mobile"** on your computer screen to scan the QR code).
  - Tap **"Install App"** (Android Chrome) or **"Add to Home Screen"** (iOS Safari).
  - The app installs as a **single, standalone offline mobile app** with an app icon on your home screen!

---

## 📋 New Feature: Drugs Classification Data Manager

You can now easily manage, add, and customize drug classification data:

1. **Add Custom Drugs:**
   - Tap the **"📋 Drug Data"** tab in the bottom bar.
   - Tap **"+ Add New Drug Data"**.
   - Pick a template (**Fentanyl**, **Ketamine**, **Tramadol**, **Methaqualone**) or type any custom substance.
   - Select the Reagent Kit (*Marquis*, *Scott*, *Duquenois-Levine*, *Mecke*, *Simon's*, *Ehrlich*, *Mandelin*, etc.).
   - Use the visual color picker or enter the HEX code.
   - Set the $\Delta E$ tolerance (5 to 30) and expected reaction time in seconds.
   - Save directly to your local offline database!
2. **Instant Field Testing:**
   - As soon as you add a drug, it is active in the classification engine.
   - Switch to the **"🧪 Test Kit"** tab and test with your camera or field samples immediately!
3. **Import from Websites / Research:**
   - Tap **"📥 Import from Web / File"** to load UNODC ST/NAR/40, DFS SOP FCS10, or paste CSV/JSON copied from any research site.
4. **Export Clean Dataset:**
   - Tap **"📤 Export"** to download the updated library as a clean `.json` file to replace `dataset/reagents_dataset.json`.

---

## 📂 Dataset Management (Separate Folder)

All color-based classification data is maintained in the dedicated [`dataset/`](./dataset/) directory:

| Path | Format | Description |
| :--- | :--- | :--- |
| [`dataset/reagents_dataset.json`](./dataset/reagents_dataset.json) | JSON | Master colorimetric library loaded directly by the edge-AI classification engine. |
| [`dataset/reagents_dataset.csv`](./dataset/reagents_dataset.csv) | CSV | Spreadsheet format for editing in Microsoft Excel or Google Sheets. |
| [`dataset/README.md`](./dataset/README.md) | Docs | Schema specifications, color space formulas, and step-by-step instructions. |
| [`dataset/sample_test_images/`](./dataset/sample_test_images/) | Images | Pre-calibrated field spot plates with ArUco calibration cards for instant testing. |

### How to Add Data from Any Website:
1. **Option A (In-App UI):** Navigate to the **🧪 Dataset** tab in the mobile app, tap **`+ Add Substance`** or **`📥 Import CSV/JSON`**, and paste data directly.
2. **Option B (Edit Files):** Add rows to [`reagents_dataset.csv`](./dataset/reagents_dataset.csv) or JSON objects to [`reagents_dataset.json`](./dataset/reagents_dataset.json).

---

## ⚡ Core Prototype Capabilities

### 1. 100% Offline-First Architecture
- **Zero Network Required**: Works in remote border outposts, coastal areas, and zero-connectivity raid zones.
- **On-Device Cryptography**: Real-time **SHA-256** computation and ECDSA digital signature simulation using the browser's native Web Crypto API.
- **Tamper-Evident Hash Chain**: Each record is cryptographically chained to the previous block:
  $$\text{ChainHash}_n = \text{SHA-256}(\text{RecordPayload}_n \parallel \text{ChainHash}_{n-1})$$
  Modifying any past record breaks the chain and is immediately flagged by the on-device auditor.

### 2. Edge-AI Color Science & Classification
- **CIE L\*a\*b\* Color Space**: Standard D65 illuminant conversion for lighting-invariant color evaluation.
- **CIEDE2000 ($\Delta E_{00}$) Matching**: Compares the reaction spot against the calibrated forensic reagent database.
- **Dynamic ArUco & Lighting Calibration**: Evaluates lux levels (flags low light $<80\text{ lx}$) and locks homography.
- **Forensic Verdicts**: Clear categorizations of **PRESUMPTIVE POSITIVE**, **NEGATIVE CONTROL**, or **INCONCLUSIVE / SEND TO FSL**.

### 3. Court-Ready Section 63 BSA Certification
- **Automated Schedule Part A**: Instantly compiles all required statutory fields (officer ID, GPS coordinates, UTC timestamp, kit batch no, raw color telemetry, image SHA-256).
- **Interactive Verification QR Code**: Encodes hash fingerprints, allowing courts or defense counsel to independently verify authenticity with a standard scanner.
- **Print / PDF Export**: One-tap export for case files and physical seizure memos.

### 4. Store-and-Forward Outbox (Future Server Database Sync)
- Records remain securely vaulted in offline local storage.
- An **Outbox** queue displays pending records and includes a simulated **Cloud Sync** trigger ready for integration with backend databases (PostgreSQL/PostGIS, MinIO S3, Hyperledger Fabric).
