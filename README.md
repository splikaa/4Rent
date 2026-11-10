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

### 🖥️ Windows Desktop (100% Zero-Installation Full-Screen App)
1. Download **`4Rent Launcher.bat`** from the [`packages/desktop/`](./packages/desktop/) directory.
2. Double-click **`4Rent Launcher.bat`**.
3. It automatically creates an official **4Rent Management System** shortcut directly on the landlord's Windows Desktop and launches 4Rent in **Full-Screen Standalone App Mode** via built-in Microsoft Edge / Google Chrome!

### 📱 Android Mobile App (Offline / Mobile Data / Wi-Fi)
1. Download **`4Rent-v1.0.0-release.apk`** from the [`packages/mobile/`](./packages/mobile/) directory.
2. Install the APK on your Android phone or tablet.
3. The app runs fully standalone with offline IndexedDB local storage, camera permissions for sub-meter capture, OS notification reminders, and real-time cloud synchronization.

---

## 📦 Packages Directory (Ready for GitHub Distribution)

All distributables are cleanly isolated in the [`packages/`](./packages/) directory:

```text
packages/
├── desktop/
│   └── 4Rent Launcher.bat          # Standalone full-screen Desktop launcher
└── mobile/
    └── 4Rent-v1.0.0-release.apk     # Standalone Android release APK
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
- **Mobile Data & Wi-Fi**: Automatically detects connection type via `navigator.connection` and synchronizes with Supabase (`4RENT-MAIN`) as soon as connectivity is restored.
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
