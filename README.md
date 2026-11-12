# 4Rent Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Management System Logo" />
</p>

<p align="center">
  <strong>Offline-First Desktop, Web PWA & Standalone Android Room, Tenant, Advance Balance, and Electric Sub-Meter OCR Billing System.</strong><br/>
  <strong>Version: <code>v1.0.0</code> • Developed by <a href="https://github.com/splikaa">splikaa</a></strong>
</p>

---

## ⚡ Quick Start: Zero Installation for Landlords

Landlords do **not** need Node.js, Python, or developer tools to run **4Rent** on Windows, Android, or modern web browsers:

### 🖥️ Windows Desktop Launcher (Portable `.EXE`)
1. Download **`4Rent-Launcher.exe`** (or **`4Rent-Desktop-Windows.zip`**) from the live web app or [`packages/desktop/`](./packages/desktop/).
2. Double-click **`4Rent-Launcher.exe`** — no installer or administrator rights needed (`asInvoker`).
3. Enter your **Property Space Code** once to create an official Desktop shortcut and launch 4Rent in an isolated standalone window.

### 📱 Android Mobile App (Offline-First Signed `.APK`)
1. Download **`4Rent-v1.0.0-release.apk`** (`~399 KB`) from the live web app or [`packages/mobile/`](./packages/mobile/).
2. Install on Android (`Android 7.0+`).
3. Includes Live Camera & Photo Sub-Meter OCR, `HD Crop` register verification, Fingerprint/Biometric unlock, native Facebook Messenger receipt sharing, and offline IndexedDB persistence.

---

## 🎮 Interactive Visual Sprite Guide (7 Step-by-Step Flows)

New users can open the built-in **4Rent Visual Sprite Guide** anytime from:
- **Dashboard Header**: Tap **Guide** (available on both Mobile and Desktop headers, plus **Watch Visual Guide** when no rooms exist yet).
- **Navigation Drawer**: Tap **Visual Sprite Guide (`7 FLOWS`)** from any screen.

Every flow pairs the animated **4Rent Guide Buddy** mascot with a **Play / Pause interactive Micro-UI Sprite Stage** across 3 clickable sub-steps and 1-click launch buttons:

1. **Flow 1 — Room Setup & Tenancy Lifecycle**: Add rooms, preserve continuous `kWh` baselines across tenants, verify ID & RA 10173 consent, and protect critical room actions with explicit confirmation dialogs.
2. **Flow 2 — Sub-Meter OCR Scan & Auto-Rollover**: Capture `#1 Previous` / `#2 Current` slots via mobile camera or desktop image upload, inspect the zoomed `HD Crop`, and automatically roll `#2` into `#1` next cycle.
3. **Flow 3 — Calendar Schedule & Pay Window Guard**: Track Day `1–10` due dates, inspect locked future months safely, and prevent duplicate scans once the current month is paid.
4. **Flow 4 — Official Statement & Receipt Sharing**: Inspect white-paper statements with dual meter photo crops, export clean **single-page A4 PDF** or high-res **PNG**, and share directly via Messenger.
5. **Flow 5 — Overpayment, Advance Balance & Refund**: Credit excess payments above `Remaining Balance` (or prepaid multi-month deposits) into next-month **Advance Balance**, guarded by **Fingerprint** (Mobile) or **4-Digit PIN** (Desktop/Web), with move-out refunds.
6. **Flow 6 — Bookings, Archive Center & Immutable Logs**: Convert reservations into move-ins in 1 tap, restore archived rooms/receipts, and retain **immutable sub-meter reading logs** that cannot be deleted.
7. **Flow 7 — Offline IndexedDB & Space Code Sync**: Work 100% offline in IndexedDB and pair Mobile safely from Desktop via your private **Property Space Code**.

---

## 🔍 Dual Sub-Meter OCR Inspector & Continuous Baseline

1. **Slot #1 (Previous Sub-Meter)**: Stores the unit's continuous `kWh` baseline, full photo proof, and zoomed register crop. Baseline readings **never reset** when a tenant vacates.
2. **Slot #2 (Current Sub-Meter)**: Uses unified Mobile/Desktop OCR (`Tesseract.js` + preprocessing + `HD Crop` dial isolation) to extract mechanical drum or digital LCD digits (`e.g. 003020.7`).
3. **Next-Month Rollover**: Issuing a monthly bill (or tapping **Rollover to Next Month**) promotes `#2 Current` directly into `#1 Previous` so monthly consumption deltas stay exact.

---

## 📅 Due Calendar, Advance Balance & Room Safeguards

- **Pay Window Policy (Days 1–10)**: Due dates align cleanly to days `1st–10th` of each month.
- **Future Month & Paid Lock**: When viewing future months or rooms already marked **Paid** for the active cycle, **Scan Meter** stays intentionally locked while **Room Details** and **Advance Payment** remain accessible.
- **Overpayments & Refunds**:
  - Recording a payment higher than **Remaining Balance** automatically routes the excess `₱` into the room's **Advance Balance** for the next billing cycle after **Fingerprint / 4-Digit PIN** verification.
  - Prepaid deposits auto-deduct upon subsequent billing cycles or can be refunded cleanly via **Advance / Refund** when a tenant vacates.
- **Room Action Confirmations**:
  - **Tenant Vacated**: Moves tenant into **Previous Tenants History**, preserves final `kWh`, and checks remaining deposit/advance.
  - **Archive Room**: Available only after vacating (occupied rooms cannot be archived accidentally).
  - **Remove Room Permanently**: Requires explicit confirmation plus **Fingerprint / 4-Digit PIN** authentication.
- **Immutable Archive Logs**: Sub-Meter reading logs inside **Archive & History** are read-only audit records and cannot be deleted.

---

## 📡 Offline-First IndexedDB & Private Cloud Space Sync

- **Offline Core**: Rooms, tenant records, dual meter crops, bills, and PIN security settings persist locally in **IndexedDB** + **localStorage** with zero internet required.
- **Desktop Space Code Host**: Only **Desktop / Web** generates or updates a **Property Space Code** (e.g., `4RENT-MAIN`).
- **Mobile Monthly Limit & Privacy Notice**:
  - Mobile devices apply a Space Code **once per calendar month**, triggering a clean reload and full snapshot hydration.
  - **Do not share your Property Space Code publicly.** Anyone holding your Space Code and database endpoint can access synced property snapshots.
- **Never Synced to Cloud**: Local unlock PINs (`pinCode`), WebAuthn credential IDs (`webAuthnCredentialId`), and optional client API tokens (`firebaseApiKey`) are stripped before any snapshot is uploaded.

---

## 🔐 API Key Hygiene & Environment Setup

This repository contains **no committed API keys, PAT tokens, or Firebase secrets**. Optional Firebase overrides are loaded exclusively at build/runtime via ignored local environment files (`.env.local`) or entered in **Settings → Cloud Sync**.

1. Copy the template file:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in your own values in `.env.local` (already excluded by [`.gitignore`](./.gitignore)):
   ```env
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
   VITE_FIREBASE_API_KEY=your_optional_web_api_key_or_rtdb_token
   VITE_PROPERTY_CODE=YOUR-SPACE-CODE
   ```
3. Never commit `.env`, `.env.local`, `google-services.json` keys, or personal GitHub access tokens to source control.

---

## 🛠️ Developer Build, APK Signing & Deployment

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Run local development server (Web / Responsive preview)
npm run dev

# 3. Type-check and build production web assets (outputs to dist/)
npm run build

# 4. Build and cryptographically sign the offline Android APK
npm run build:apk

# 5. Launch native Electron Desktop host (optional)
npm run electron
```

### Distributables Layout

```text
packages/
├── desktop/
│   ├── 4Rent-Launcher.exe          # Portable Windows launcher (~39 KB)
│   ├── 4rent-icon.ico              # Multi-resolution Windows icon
│   └── src/LauncherProgram.cs      # C# WinForms launcher source
└── mobile/
    └── 4Rent-v1.0.0-release.apk    # Signed offline Android APK (~399 KB)
```

---

## 📄 License

Licensed under the **MIT License** — see [`LICENSE`](./LICENSE) for full terms and conditions.
