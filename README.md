# 4Rent Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Management System Logo" />
</p>

<p align="center">
  <strong>A modern, cross-platform Desktop & Mobile Property, Room & Sub-Meter Management System for Landlords.</strong><br/>
  <strong>Version: <code>v1.0.0</code> • Developed by <a href="https://github.com/splikaa">splikaa</a></strong><br/>
  <strong>🌐 Live App (Desktop & Mobile PWA): <a href="https://splikaa.github.io/4Rent/">https://splikaa.github.io/4Rent/</a></strong>
</p>

---

## 📋 Table of Contents

1. [System Overview](#-system-overview)
2. [Installation & Launch Guide (Desktop, Electron & Mobile)](#-installation--launch-guide-desktop-electron--mobile)
3. [Step-by-Step Landlord Operating Instructions](#-step-by-step-landlord-operating-instructions)
4. [Landlord Safety & Tenant Privacy Features (RA 10173 Ready)](#-landlord-safety--tenant-privacy-features-ra-10173-ready)
5. [Core Billing & Sub-Meter Formulas](#-core-billing--sub-meter-formulas)
6. [Clean Repository Structure](#-clean-repository-structure)
7. [Developer Setup & Scripts](#-developer-setup--scripts)
8. [License](#-license)

---

## 🏢 System Overview

**4Rent Management System (`v1.0.0`)** is an all-in-one apartment, room, and electric sub-meter billing platform designed for landlords and property managers. It runs seamlessly across **Windows Desktop (`4Rent Launcher` / Electron)**, **macOS**, **Linux**, and **Android / iOS Mobile Devices**.

### Key Highlights
- **Spacious, High-Readability UI/UX**: Engineered with generous breathing room, spring-physics transitions, and responsive layouts across desktop monitors, tablets, and smartphones.
- **2× Super-Resolution De-Blur Sub-Meter OCR**: Reads blurry or low-light electric sub-meter photos accurately and attaches **2 Sub-Meter Photo Proofs (Previous & Current)** to every Official Receipt.
- **Anti-Tamper Official Receipts (`4R-SEAL-XXXXXX`)**: Every generated receipt carries a cryptographic verification seal to protect the landlord from altered payment screenshots.
- **Public Screen Privacy Shield**: 1-click toggle in the sidebar or Settings that masks tenant mobile numbers (`0917-•••-••01`) and landlord revenue figures (`₱••,•••.••`) when viewing the screen in public.
- **Update-Safe Persistent Storage**: Uses a triple-layer storage architecture (`IndexedDB` + `LocalStorage` + real-time `Supabase Cloud Sync`) so landlord data never resets during app updates.

---

## 🚀 Installation & Launch Guide (Desktop, Electron & Mobile)

### 1. Windows Desktop (`4Rent Launcher`)
1. Double-click **`4Rent Launcher.bat`** in the project folder (or download it from **Settings → Install 4Rent Launcher** when viewing in a browser).
2. The launcher automatically creates the **`4Rent Launcher`** shortcut on your Windows Desktop and opens the system in a dedicated standalone Desktop window.
3. **Auto-Clean Installer UI**: Once the landlord launches the system from the Desktop version, the *"Install 4Rent for Desktop"* prompt inside **Settings** is automatically hidden.

### 2. Native Electron Desktop Window (Optional)
If you have Node.js and Electron installed locally:
```bash
npm install
npm run electron
```
This launches [electron/main.cjs](./electron/main.cjs) in a native frameless-menu desktop window (`1380×880`, dark theme `#0B0E14`).

### 3. Mobile App Installation (Android & iOS)
1. Open **[https://splikaa.github.io/4Rent/](https://splikaa.github.io/4Rent/)** on your phone's browser (**Chrome** on Android or **Safari** on iOS).
2. Tap **Share → Add to Home Screen** (iOS) or **Menu (⋮) → Install App / Add to Home Screen** (Android).
3. Launch **4Rent Management System** from your phone's home screen. It runs in full-screen standalone mode with a dedicated **Mobile Bottom Navigation Bar** (`Home`, `Rooms`, center `OCR` scanner button, `Bills`, and `Settings`).

---

## 📖 Step-by-Step Landlord Operating Instructions

### Step 1: Configure Property Rate & Security (`Settings`)
1. Open **Settings** from the navigation sidebar (or bottom bar on mobile).
2. Set your **Property Name** (default: `4Rent Management System`), **Default Monthly Room Rent (`₱`)**, and **Global Electric Sub-Meter Rate (`₱/kWh`)**.
3. Click **Save Property Settings**.
4. *(Recommended)* Under **Desktop Security (4-Digit Passcode PIN)**, set your personal 4-digit landlord PIN and choose an **Idle Auto-Lock Inactivity Timer** (`5`, `15`, or `30` minutes).

### Step 2: Add Rooms & Onboard Tenants (`Rooms`)
1. Go to **Rooms** and click **Add New Room**.
2. Enter the **Room Name** (e.g., `Room 101`), **Monthly Rent**, **Security Deposit**, and **Current Sub-Meter Reading (`kWh`)**.
3. When a tenant moves in, switch the room status to **Occupied** and fill in:
   - **Tenant Full Name** & **Mobile Number** (auto-formats as `09XX-XXX-XXXX`)
   - **Emergency Contact Name & Phone**
   - **Preferred Payment Due Day** (strictly enforced within the **Day 1 to Day 10** monthly billing window)
   - Check **Government Valid ID Verified** and **Data Privacy & Lease Consent (RA 10173)**

### Step 3: Scan Electric Sub-Meters & Generate Official Receipts (`Scan Meter`)
1. Click **Scan Sub-Meter** on any Room Card (or tap the center **OCR** button on mobile).
2. Select the **Billing Period** from the dropdown.
3. Upload or capture photos for **Sub-Meter #1 (Previous Reading)** and **Sub-Meter #2 (Current Reading)**, or let the **Enhanced 2× De-Blur OCR** extract the `kWh` digits automatically.
4. Review the live breakdown and click **Generate Official Receipt**.

### Step 4: Share Receipts & Record Payments (`Payment History`)
1. Click any generated bill or Room Receipt button to open the **Official Receipt Modal**.
2. Click **Print / Save PDF** to print a clean receipt, or click **Copy Summary & Open Messenger** to send the itemized bill directly to the tenant.
3. When the tenant pays via **Cash**, **GCash**, **Maya**, or **Bank Transfer**:
   - Record a **Full Payment**, **Partial Payment** (remaining balance carries over automatically), or **Overpayment** (excess amount is automatically credited to the tenant's withdrawable **Advance Payment Balance**).

### Step 5: Sync Between Desktop & Mobile (`Cloud Sync & Backup`)
- **Cloud Sync**: In **Settings**, click **Sync Push** on Desktop to upload your latest rooms and bills, then tap **Sync Pull** on your Mobile App to mirror the exact state.
- **Local Backup**: Click **Export Backup (.JSON)** at any time to save an offline backup copy of your entire database. *(Note: Destructive "Reset Database to Empty" has been permanently disabled to protect landlord records.)*

---

## 🛡️ Landlord Safety & Tenant Privacy Features (RA 10173 Ready)

| Safety / Privacy Feature | How It Protects the Landlord & Tenants |
| :--- | :--- |
| **1-Click Public Screen Privacy Shield** | Toggle **Privacy Shield** in the sidebar or Settings to immediately mask all tenant phone numbers (`0917-•••-••01`) and total revenue/collection figures (`₱••,•••.••`) on screen. |
| **Anti-Tamper Receipt Seal (`4R-SEAL-XXXXXX`)** | Every Official Receipt computes a deterministic verification code from the receipt number, room, and total amount due—preventing forged payment screenshots. |
| **Receipt Contact Redaction** | Masks middle digits of tenant mobile numbers on printed and shared receipts so personal phone numbers cannot be harvested if a receipt is forwarded. |
| **Tenant Valid ID & RA 10173 Consent Tracking** | Records whether each tenant has presented a valid government ID, provided an emergency contact, and signed data privacy consent upon move-in. |
| **Idle Auto-Lock & PIN Protection** | Automatically locks the screen after `5`, `15`, or `30` minutes of inactivity and requires the landlord's 4-digit PIN before any room can be deleted. |
| **Local Security & Activity Audit Log** | Logs sensitive actions (room edits, bill generation, settings changes, PIN unlocks) locally in **Settings** for landlord accountability. |

---

## ⚡ Core Billing & Sub-Meter Formulas

Every bill and Official Receipt strictly computes electric consumption using the global rate configured in **Settings**:

$$\Delta \text{Consumption (kWh)} = \text{Current Sub-Meter Reading} - \text{Previous Sub-Meter Reading}$$

$$\text{Electric Sub-Total (₱)} = \Delta \text{Consumption (kWh)} \times \text{Global Settings Rate (₱/kWh)}$$

$$\text{Total Amount Due (₱)} = \text{Base Rent} + \text{Electric Sub-Total} + \text{Previous Unpaid Balance} - \text{Advance Credit Applied}$$

---

## 📁 Clean Repository Structure

```text
4Rent/
├── 4Rent Launcher.bat                  # 1-Click Windows Desktop Launcher & Shortcut Creator
├── start-4rent.sh                      # macOS / Linux Local Server Launcher
├── capacitor.config.json               # iOS / Android Mobile App Configuration (v1.0.0)
├── electron/
│   └── main.cjs                        # Native Electron Desktop Window Wrapper
├── public/
│   ├── 4rent-icon.ico                  # Desktop Application Icon
│   ├── icon.svg                        # Scalable Brand Vector Logo
│   ├── icon-192.png & icon-512.png     # Mobile PWA Home Screen Icons
│   ├── manifest.webmanifest            # Standalone PWA Manifest (4Rent Management System)
│   └── sw.js                           # Offline-Ready Service Worker (v1.0.0)
├── src/
│   ├── components/
│   │   ├── archive/                    # Archive Center (Archived Rooms, Bills & Past Tenants)
│   │   ├── common/                     # Global ErrorBoundary Recovery
│   │   ├── dashboard/                  # Landlord Overview, Metrics & Due Window Alerts
│   │   ├── inquiries/                  # Vacant-Only Room Inquiries & Booking Reservations
│   │   ├── layout/                     # Desktop NavigationDrawer & MobileBottomNav
│   │   ├── modals/                     # Advance Balance, PIN Auth & Reminder Modals
│   │   ├── ocr/                        # Dual Sub-Meter 2x De-Blur OCR Scanner Modal
│   │   ├── payments/                   # Payment History, Partial/Overpayment Recording
│   │   ├── receipt/                    # Official Receipt Modal with Anti-Tamper Seal
│   │   ├── rooms/                      # Room Cards, Room Form & Room Details Modal
│   │   ├── security/                   # 4-Digit Passcode PIN Lock & Setup Screens
│   │   └── settings/                   # Property Rates, Privacy Shield, Cloud Sync & Audit Log
│   ├── services/                       # IndexedDB, LocalStorage, OCR & Supabase Cloud Sync
│   ├── types/                          # TypeScript Interfaces (rental.ts)
│   └── utils/                          # Billing Engine, Privacy Masking & Vitest Unit Tests
└── supabase/
    └── migrations/                     # Cloud Sync SQL Schema
```

---

## 💻 Developer Setup & Scripts

### Prerequisites
- **Node.js** `v18+` (recommended `v20` or `v22`)
- **npm** `v9+`

### Commands
```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Launch in Electron desktop window
npm run electron

# 4. Run unit test suite (Vitest)
npm test

# 5. Build production bundle (TypeScript + Vite)
npm run build
```

---

## 📄 License

Distributed under the **MIT License**. Developed by **[splikaa](https://github.com/splikaa)**. See [`LICENSE`](./LICENSE) for full details.
