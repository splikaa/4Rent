# 4Rent Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Management System Logo" />
</p>

<p align="center">
  <strong>Offline-First Desktop (Windows &amp; macOS), Web PWA (iOS &amp; Android) &amp; Mobile App for Room, Tenant, Monthly Rent Schedule, Advance Balance, and Mandatory Electric Sub-Meter OCR Billing.</strong><br/>
  <strong>Version: <code>v1.1.0</code> • Developed by <a href="https://github.com/splikaa">splikaa</a></strong>
</p>

---

## ✨ What's New in `v1.1.0`

- **macOS Desktop Packaging (Electron `.dmg` & `.zip`)**: Native Apple Silicon (`arm64`) and Intel (`x64`) packaging via `electron-builder`, bundled `.icns` app icon, hardened runtime entitlements, camera usage prompt, macOS application/Edit menus (`Cmd+C`/`Cmd+V`/`Cmd+Q`), and native clipboard PNG IPC bridge.
- **iOS Safari "Add to Home Screen" PWA Support**: Full standalone iOS web app experience with `#0B0E14` dark status bar integration, opaque Apple touch icons (`180x180`, `167x167`, `152x152`), safe-area notch insets, same-origin Service Worker caching, and live rear-camera OCR support on mobile web/iOS.
- **Copy Receipt as PNG**: Replaced desktop and mobile `Share PDF to Messenger` with one-tap **Copy Receipt as PNG** (high-resolution 2.5x PNG copied directly to the clipboard for instant pasting into Messenger and chat apps) while preserving **Share Receipt**, **Download PDF**, **Download PNG**, and **Print Receipt**.
- **Independent Monthly Electricity Rate Schedule**: Fixed rate editing so pressing Backspace allows completely empty inputs without snapping to `0` (validating on Save), enforced strict month-by-month rate independence (editing February never changes January, March, or default fallback rates), and preserved historical monthly rates on previously issued bills.
- **Monthly Rent Payment Schedule, Proration & Configurable Late Penalty**: Replaced legacy window logic with a billing-month-anchored **1st–10th** payment period (Due Date: **10th**, Late Penalty starting **11th**), calendar-accurate daily rent proration (28/29 leap-year/30/31-day months + mid-month move-in and move-out dates), and an admin-configurable Late Payment Penalty (Fixed `₱` or `%`, one-time or per-day, disabled by default with zero hardcoded rates).
- **Mandatory OCR Sub-Meter Electricity Billing & Separate Payment Tracking**: Closes the rent-without-electricity loophole by requiring a verified monthly sub-meter reading (previous & current kWh) before bill generation, blocking duplicate monthly bills/readings per room and month, rejecting negative consumption unless a meter reset/replacement is documented, and tracking **Rent**, **Electricity**, and **Late Penalty** balances separately so bills remain `PARTIAL` until electricity charges are paid.
- **Database Integrity (IndexedDB v3 / Schema v2)**: Non-destructive automatic migration preserving all existing records, dedicated `monthly_readings` store with unique `(roomId, billingMonthKey)` constraint, and atomic `commitBillingTransaction` writes with rollback safety.

---

## ⚡ Quick Start: Desktop, macOS, iOS & Android

Landlords do **not** need developer tools to run **4Rent** on Windows, iOS, Android, or modern web browsers:

### 🖥️ Windows Desktop Launcher (Portable `.EXE`)
1. Download **`4Rent-Launcher.exe`** (or **`4Rent-Desktop-Windows.zip`**) from the live web app or [`packages/desktop/`](./packages/desktop/).
2. Double-click **`4Rent-Launcher.exe`** — no installer or administrator rights needed (`asInvoker`).
3. Enter your **Property Space Code** once to create an official Desktop shortcut and launch 4Rent in an isolated standalone window.

### 🍎 macOS Desktop App (Electron `.DMG` / `.ZIP`)
1. On a macOS machine (Apple Silicon `arm64` or Intel `x64`), clone this repository and build the installable macOS package:
   ```bash
   npm install --legacy-peer-deps
   npm run dist:mac
   ```
2. Open the generated `.dmg` inside `release/`, drag **`4Rent.app`** into **Applications**, and launch.
3. Alternatively, run directly in desktop mode with `npm run build && npm run electron`.

### 📲 iOS Home Screen App (Safari PWA — iPhone & iPad)
1. Open the live HTTPS web app ([`https://splikaa.github.io/4Rent/`](https://splikaa.github.io/4Rent/)) in **Safari** on iOS.
2. Tap the **Share** button (square with up arrow) and choose **Add to Home Screen**.
3. Tap **Add**, then launch **4Rent** from your Home Screen for full-screen standalone app mode with offline IndexedDB persistence, live camera sub-meter OCR, and one-tap **Copy Receipt as PNG** / **Share Receipt**.

### 📱 Android Mobile App (Offline-First Signed `.APK`)
1. Download **`4Rent-v1.0.0-release.apk`** from the live web app or [`packages/mobile/`](./packages/mobile/).
2. Install on an Android device (`Android 7.0+`).
3. Includes Live Camera & Photo Sub-Meter OCR, `HD Crop` register verification, Biometrics / 4-Digit PIN unlock, Copy Receipt as PNG & Share Receipt, and offline IndexedDB persistence.

---

## 🎮 Interactive Visual Sprite Guide (7 Step-by-Step Flows)

New users can open the built-in **4Rent Visual Sprite Guide** anytime from:
- **Dashboard Header**: Tap **Guide** (available on both Mobile and Desktop headers, plus **Watch Visual Guide** when no rooms exist yet).
- **Navigation Drawer**: Tap **Visual Sprite Guide (`7 FLOWS`)** from any screen.

Every flow pairs the animated **4Rent Guide Buddy** mascot with a **Play / Pause interactive Micro-UI Sprite Stage** across 3 clickable sub-steps and 1-click launch buttons:

1. **Flow 1 — Room Setup & Tenancy Lifecycle**: Add rooms, preserve continuous `kWh` baselines across tenants, verify ID & RA 10173 consent, and protect critical room actions with explicit confirmation dialogs.
2. **Flow 2 — Sub-Meter OCR Scan & Auto-Rollover**: Capture `#1 Previous` / `#2 Current` slots via mobile camera or desktop image upload, inspect the zoomed `HD Crop`, and automatically roll `#2` into `#1` next cycle.
3. **Flow 3 — Monthly Rent Schedule & Due Calendar**: Track billing-month **1st–10th** payment windows (late penalty starting Day **11**), inspect locked future months safely, and prevent duplicate scans once a month is already billed or paid.
4. **Flow 4 — Official Statement & Copy Receipt as PNG**: Inspect white-paper statements with dual meter photo crops, proration & separate Rent/Electricity tracking, **Copy Receipt as PNG** straight into Messenger, or **Share Receipt** / export **A4 PDF**.
5. **Flow 5 — Overpayment, Advance Balance & Refund**: Credit excess payments above `Remaining Balance` (only once electricity charges are settled) into next-month **Advance Balance**, guarded by **Biometrics or 4-Digit PIN**, with move-out refunds.
6. **Flow 6 — Bookings, Archive Center & Immutable Logs**: Convert reservations into move-ins in 1 tap, restore archived rooms/receipts, and retain **immutable sub-meter reading logs** that cannot be deleted.
7. **Flow 7 — Offline IndexedDB & Space Code Sync**: Work 100% offline in IndexedDB and pair Mobile safely from Desktop via your private **Property Space Code**.

---

## 🔍 Mandatory Dual Sub-Meter OCR Inspector & Continuous Baseline

1. **Slot #1 (Previous Sub-Meter)**: Stores the unit's continuous `kWh` baseline, full photo proof, and zoomed register crop. Baseline readings **never reset** when a tenant vacates.
2. **Slot #2 (Current Sub-Meter)**: Uses unified Mobile/Desktop/iOS OCR (`Tesseract.js` + preprocessing + `HD Crop` dial isolation) to extract mechanical drum or digital LCD digits (`e.g. 003020.7`) and requires explicit administrator verification (with PIN-authorized correction and documented reset/rollover justification for negative deltas) before saving.
3. **Mandatory Billing & Anti-Loophole Enforcement**: Every occupied room must have a verified monthly reading before final bill generation, duplicate monthly readings or bills per `(roomId, billingMonthKey)` are blocked, and Rent vs. Electricity vs. Late Penalty balances are tracked separately so paying rent alone leaves the bill `PARTIAL` until electricity is paid.
4. **Next-Month Rollover**: Issuing a monthly bill (or tapping **Rollover to Next Month**) promotes `#2 Current` directly into `#1 Previous` so monthly consumption deltas stay exact.

---

## 📅 Monthly Rent Schedule, Proration, Late Penalty & Room Safeguards

- **Billing-Month Payment Schedule (1st–10th)**: Every billing month uses a **1st–10th** payment period with Due Date on the **10th**; starting on the **11th**, the tenant becomes subject to the administrator-configured late payment penalty.
- **Calendar-Accurate Rent Proration**: Supports mid-month move-in and move-out dates by computing `(Monthly Rent ÷ Calendar Days in Billing Month) × Chargeable Occupancy Days` across 28, 29 (leap year), 30, and 31-day months.
- **Configurable Late Penalty (No Hardcoded Rates)**: Administrators configure fixed (`₱`) or percentage (`%`), one-time or per-day late penalties in **Settings → Monthly Rent Payment Schedule & Late Penalty** (disabled by default until set).
- **Independent Monthly Electricity Rates**: Each month maintains its own independent `₱/kWh` rate without affecting prior or future months or historical bills, with empty-safe decimal editing validated on Save.
- **Future Month & Paid Lock**: When viewing future months or rooms already marked **Paid** for the active cycle, **Scan Meter** stays intentionally locked while **Room Details** and **Advance Payment** remain accessible.
- **Overpayments & Refunds**:
  - Recording a payment higher than **Remaining Balance** automatically routes the excess `₱` into the room's **Advance Balance** for the next billing cycle (once electricity charges are covered) after **Fingerprint / 4-Digit PIN** verification.
  - Prepaid deposits auto-deduct upon subsequent billing cycles or can be refunded cleanly via **Advance / Refund** when a tenant vacates.
- **Room Action Confirmations**:
  - **Tenant Vacated**: Moves tenant into **Previous Tenants History**, preserves final `kWh`, and checks remaining deposit/advance.
  - **Archive Room**: Available only after vacating (occupied rooms cannot be archived accidentally).
  - **Remove Room Permanently**: Requires explicit confirmation plus **Fingerprint / 4-Digit PIN** authentication.
- **Immutable Archive Logs**: Sub-Meter reading logs inside **Archive & History** are read-only audit records and cannot be deleted.

---

## 📡 Offline-First IndexedDB & Private Cloud Space Sync

- **Offline Core**: Rooms, tenant records, verified `monthly_readings` (IndexedDB v3 with unique `(roomId, billingMonthKey)` index), dual meter crops, bills, and PIN security settings persist locally in **IndexedDB** + **localStorage** with atomic billing transactions and zero internet required.
- **Desktop Space Code Host**: Only **Desktop / Web** generates or updates a **Property Space Code** (randomly generated per fresh install).
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

## 🛠️ Developer Build, Desktop Packaging, Testing & Deployment

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Run automated unit, financial, OCR, storage, migration & UI test suite
npm test

# 3. Run local development server (Web / Responsive preview)
npm run dev

# 4. Type-check and build production web assets (outputs to dist/)
npm run build

# 5. Launch native Electron Desktop host locally
npm run electron

# 6. Package macOS .dmg and .zip installers (run on macOS — Apple Silicon & Intel)
npm run dist:mac

# 7. Package Windows Electron NSIS / portable builds
npm run dist:win

# 8. Build and cryptographically sign the offline Android APK
npm run build:apk
```

### Distributables & Packaging Layout

```text
build/
├── icon.icns                       # Multi-resolution macOS app icon
├── icon.ico                        # Multi-resolution Windows app icon
├── icon.png                        # 1024x1024 master desktop icon
└── entitlements.mac.plist          # macOS hardened runtime & camera entitlements
electron/
├── main.cjs                        # Cross-platform Electron host (macOS menus + clipboard IPC)
└── preload.cjs                     # Context-isolated desktop bridge
packages/
├── desktop/
│   ├── 4Rent-Launcher.exe          # Portable Windows Desktop launcher (~44 KB)
│   ├── 4rent-icon.ico              # Multi-resolution Windows icon
│   └── src/LauncherProgram.cs      # C# WinForms launcher source
└── mobile/
    └── 4Rent-v1.0.0-release.apk    # Signed offline Android Mobile App APK
```

---

## 📄 License

Licensed under the **MIT License** — see [`LICENSE`](./LICENSE) for full terms and conditions.
