# 4Rent Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Management System Logo" />
</p>

<p align="center">
  <strong>Zero-Installation Full-Screen Desktop & Standalone Android Mobile Property, Room & Electric Sub-Meter Billing System.</strong><br/>
  <strong>Version: <code>v1.0.0</code> • Developed by <a href="https://github.com/splikaa">splikaa</a></strong>
</p>

---

## ⚡ Quick Start: Zero Installation for Landlords

Landlords do **not** need to install Node.js, Python, Git, or any complex developer tools:

### 🖥️ Windows Desktop Launcher (Official Portable Standalone `.EXE`)
1. Download **`4Rent-Launcher.exe`** directly from the live web app or the [`packages/desktop/`](./packages/desktop/) directory.
2. Double-click **`4Rent-Launcher.exe`** (no installation required).
3. The sleek launcher lets you enter your **Property Space Code**, creates an official **4Rent Management System** desktop shortcut with the high-resolution system logo, and opens 4Rent in an isolated, borderless standalone desktop window host!

### 📱 Android Mobile App (Offline-First `.APK`)
1. Download **`4Rent-v1.0.0-release.apk`** directly from the live web app or the [`packages/mobile/`](./packages/mobile/) directory.
2. Install the APK on your Android device (Android 7.0+).
3. Features real-time Sub-Meter OCR live camera with auto-reticle green lock, direct 1-tap Facebook Messenger receipt forwarding, offline IndexedDB storage, and instant cloud sync.

---

## 🛡️ System Assurance & Reliability

**4Rent Management System** is built on five strict architectural assurances designed for property managers and landlords:

1. **100% Offline-First Persistence (IndexedDB Local Core)**
   - Operates with complete autonomy with or without internet. Room states, tenant contracts, sub-meter dial crops, and payment ledgers are committed directly to your device's browser IndexedDB database. You can inspect sub-meters in concrete apartment basements with zero cellular reception with zero data loss.

2. **Multi-Landlord Security & Data Partitioning**
   - Data is partitioned by **Property Space Code** (e.g. `4RENT-MAIN`, `4R-B4U7`). Landlords operating separate boarding houses or buildings remain strictly isolated. Switching or pairing devices takes one tap.

3. **Sub-Meter OCR Precision & Verifiable Audit Proof**
   - Electric sub-meter readings are extracted through cyclometer-register optical recognition with an emerald green lock reticle. Every official statement embeds side-by-side photographic crops of the dials and a cryptographic tamper-proof verification seal (`4R-SEAL-XXXXXX`) to prevent tenant tampering or altered payment claims.

4. **Philippine Rental Law Compliance (R.A. 9653)**
   - Hardcoded compliance with Philippine rental standards: strict **Day 1–10 Payment Grace Windows**, forward billing period lock (future months cannot be billed in advance), and strict separation between non-deductible property Security Deposits and deductible Advance Rent.

5. **Safe Execution & Clean Distributables Assurance**
   - **Zero Malware / Zero Telemetry**: The Windows Desktop Launcher (`4Rent-Launcher.exe`) is an open-source, portable C# binary compiled with standard Windows 10/11 compatibility manifests (`asInvoker`), requiring no administrative elevation, no registry modifications, and leaving zero system residue.
   - **Instant Safe Download**: To bypass Google Chrome's "not commonly downloaded" heuristics on freshly uploaded `.exe` files, landlords can directly download the portable **`4Rent-Desktop-Windows.zip`** or install the **1-Click Native Desktop App** directly from their browser.
   - **Android Integrity**: The mobile app (`4Rent-v1.0.0-release.apk`) is self-contained with hardware biometric authentication support and native camera integration.

---

All official distributables are cleanly compiled and hosted for direct download:

```text
packages/
├── desktop/
│   ├── 4Rent-Launcher.exe          # Official standalone Windows Desktop launcher (~39 KB)
│   ├── 4rent-icon.ico              # Multi-resolution official system icon
│   └── src/LauncherProgram.cs      # Portable C# WinForms source
└── mobile/
    └── 4Rent-v1.0.0-release.apk     # Standalone cryptographically signed Android APK (~323 KB)
```

---

## 🔍 Dual Sub-Meter Visual Inspector & Auto-Read Engine

When billing a room, **4Rent** provides an accurate dual sub-meter reading workflow:

1. **Slot #1: Previous Sub-Meter**
   - Holds the verified starting baseline reading (`kWh`), full photo, and cropped dial screenshot from the previous billing period.
2. **Slot #2: Current Sub-Meter**
   - The landlord takes a photo or uploads an image of the new reading.
   - **Automatic Reading Insertion**: The visual OCR engine immediately extracts the dial digits (e.g. `3.4 kWh`), auto-inserts the value directly into the slot input, and updates the electricity cost in real time.
   - **Verified Value Crop**: Simultaneously crops and displays a zoomed-in screenshot of the physical dials/LCD display directly inside the slot card and on the official receipt.
3. **Next-Month Automatic Rollover**:
   - When generating the bill, the Current Sub-Meter reading, photo, and crop are automatically saved as the room's continuous baseline.
   - Next month, when the landlord opens the bill generator, the previous Current reading is automatically pre-filled as the new Previous Sub-Meter (#1), with a dedicated **"Rollover to Next Month"** button for immediate manual rollover.

---

## 🧾 Clean Official Statement & Sub-Meter Receipt

The generated **Official Statement of Account & Sub-Meter Billing Receipt** includes:
- **Section I • Electric Sub-Meter Proofs**: Dual side-by-side cropped dial screenshots showing both Previous and Current readings with calculated consumption and rate.
- **Section II • Itemized Charges**: Monthly Base Rent, Electric Sub-Meter Consumption, Previous Carried-Over Unpaid Balances, and Auto-Deducting Advance Rent.
- **Tamper-Proof Verification Seal (`4R-SEAL-XXXXXX`)**: Unique cryptographic seal guaranteeing authenticity against altered tenant screenshots.
- **Modern Clean Layout**: Redundant manual signature boxes have been removed in favor of digital tamper-proof verification seals.
- **1-Click Messenger App Sharing**:
  - On **Mobile**: Deep links directly into the native Facebook Messenger application (`com.facebook.orca` / `fb-messenger://`).
  - On **Desktop**: Direct Messenger web link and instant formatted clipboard summary.
  - **Download PNG** & **Print / PDF**: High-resolution receipt export.

---

## 📡 Three-Tier Connectivity & Smart Two-Way Sync

4Rent operates seamlessly in any environment:
- **Offline Mode**: Uses browser IndexedDB (`idbDatabase.ts`) so landlords can record readings, generate bills, and inspect rooms in apartment basements with zero reception.
- **Mobile Data & Wi-Fi**: Automatically detects connection type via `navigator.connection` and synchronizes with Firebase Realtime Database (`4RENT-MAIN`) as soon as connectivity is restored.
- **Conflict-Free Merge**: Timestamps ensure newest device changes take precedence without data loss.

---

## 🏢 Landlord Security & Tenant Privacy (RA 10173 Ready)

- **Mandatory 4-Digit Passcode PIN**: Protects financial data with idle auto-lock timers (`5`, `15`, or `30` minutes).
- **Public Screen Privacy Mask**: 1-click toggle in the header or Settings masks tenant mobile numbers (`0917-•••-••01`) and landlord revenue figures (`₱••,•••.••`) when viewing the screen in public.
- **Day 1–10 Payment Window Policy**: Enforces standard Philippine rental payment windows with due dates strictly between the 1st and 10th of every month.
- **Advance Rent vs. Security Deposit Separation**: Tenant security deposits remain strictly non-deductible on file to protect property repairs, while overpayments automatically credit into Advance Rent.

---

## 🛠️ Developer Build & Deployment Instructions

To rebuild the web bundle and update the GitHub Pages live deployment:

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Build production assets (outputs to dist/)
npm run build

# 3. Launch native Electron Desktop window
npm run electron
```

---

## 📄 License

MIT License. Designed and engineered for **4Rent Management System** landlords and property managers.
