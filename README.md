# 4Rent Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Management System Logo" />
</p>

<p align="center">
  <strong>A modern, cross-platform Desktop (4Rent Launcher / Electron) & Native Mobile (Flutter Android APK / iOS Swift) Property, Room & Sub-Meter Management System.</strong><br/>
  <strong>Version: <code>v1.0.0</code> • Developed by <a href="https://github.com/splikaa">splikaa</a></strong>
</p>

---

## 📋 Table of Contents

1. [System Overview](#-system-overview)
2. [Desktop & Native Mobile App Installation](#-desktop--native-mobile-app-installation)
3. [Accurate Sub-Meter Visual Inspector & OCR Engine](#-accurate-sub-meter-visual-inspector--ocr-engine)
4. [Step-by-Step Landlord Operating Instructions](#-step-by-step-landlord-operating-instructions)
5. [Landlord Safety & Tenant Privacy Features (RA 10173 Ready)](#-landlord-safety--tenant-privacy-features-ra-10173-ready)
6. [Core Billing & Sub-Meter Formulas](#-core-billing--sub-meter-formulas)
7. [Clean Repository Structure](#-clean-repository-structure)
8. [Developer Setup & Scripts](#-developer-setup--scripts)
9. [License](#-license)

---

## 🏢 System Overview

**4Rent Management System (`v1.0.0`)** is a complete apartment, room, and electric sub-meter billing platform designed for landlords and property managers. It combines a **Desktop Application (`4Rent Launcher` / Electron)** with a **Native Flutter Mobile Application (`mobile_app/` for Android `.apk` & iOS Swift)** connected via **Real-Time Supabase Synchronization**.

### Key Highlights
- **Spacious, High-Readability UI/UX**: Engineered with generous breathing room, spring-physics transitions, and responsive layouts.
- **Hardware-Calibrated Sub-Meter OCR Inspector**: Accurately reads **6-Drum Cyclometer Registers (`5 Black Integer Drums + 1 Red Tenths Drum [0.1 / 1/10 kWh]`)** and **Digital LCD Sub-Meters** while automatically filtering out faceplate serial numbers, barcodes, and electrical rating stickers.
- **Native Flutter Mobile App (`mobile_app/`)**: Installable Android `.apk` & iOS Swift mobile codebase with live bidirectional Supabase Realtime sync (`4RENT-MAIN`) with the Desktop app.
- **Anti-Tamper Official Receipts (`4R-SEAL-XXXXXX`)**: Every generated receipt carries a cryptographic verification seal to protect the landlord from altered payment screenshots.
- **Public Screen Privacy Shield**: 1-click toggle in the sidebar or Settings that masks tenant mobile numbers (`0917-•••-••01`) and landlord revenue figures (`₱••,•••.••`) when viewing the screen in public.

---

## 🚀 Desktop & Native Mobile App Installation

### 1. Windows Desktop (`4Rent Launcher` & Electron)
1. Double-click **`4Rent Launcher.bat`** in the project folder.
2. It automatically creates the **`4Rent Launcher`** shortcut on your Windows Desktop and opens the system in a dedicated Desktop window.
3. **Auto-Clean Installer UI**: Once launched via Desktop, the *"Install 4Rent for Desktop"* prompt inside **Settings** is automatically removed.
4. **Native Electron Mode**: Run `npm run electron` to launch [electron/main.cjs](./electron/main.cjs) directly.

### 2. Native Mobile App (`mobile_app/` — Flutter for Android APK & iOS Swift)
The repository includes a full native Flutter & iOS Swift mobile application in [`mobile_app/`](./mobile_app) that synchronizes in real time with the Desktop system via Supabase Realtime (`public.four_rent_sync` / channel `4rent-live-4RENT-MAIN`):
```bash
cd mobile_app
flutter pub get
# Build installable Android APK:
flutter build apk --release
# Or build for iOS (macOS with Xcode):
flutter build ios --release
```
*(On Windows, you can also double-click [`mobile_app/Build-Mobile-APK.bat`](./mobile_app/Build-Mobile-APK.bat) to compile the installable `.apk`.)*

---

## 🔍 Accurate Sub-Meter Visual Inspector & OCR Engine

Unlike naive OCR scanners that accidentally read meter serial numbers or barcodes as `kWh`, **4Rent Management System (`v1.0.0`)** uses a multi-stage **Sub-Meter Hardware & Register Inspector** ([`src/services/ocrService.ts`](./src/services/ocrService.ts) & [`src/utils/billingCalculator.ts`](./src/utils/billingCalculator.ts)):

| Sub-Meter Model | Register Type | Register Breakdown | Ignored Faceplate Serial / Specs | Accurate Result |
| :--- | :--- | :--- | :--- | :--- |
| **Safari `SY-168`** *(No. 2018-18120672)* | 6-Drum Cyclometer (`5 Black + 1 Red [0.1]`) | Black: `00000` • Red Tenths: `.1` | `No. 2018-18120672`, `1600imp/kW·h`, `220/240V` | **`0.1 kWh`** |
| **Static Watthour `TYPE-SP1`** *(S.No. 470946)* | 6-Drum Cyclometer (`10000..1 | 1/10`) | Black: `00003` • Red `1/10`: `.4` | `S.No. 470946`, `10000 1000 100 10 1 1/10`, `3200imp/kWh` | **`3.4 kWh`** |
| **GE `kV2c` Multifunction** *(18853562)* | Digital LCD Screen | Blank / Unpowered LCD Screen | Barcode `18853562`, `023 013562`, `784X300997`, `120-480V` | **`0.0 kWh`** *(Blank LCD)* |
| **Safari `SY-168`** *(No. KW2151075721)* | 6-Drum Cyclometer (`10000..1 | 0.1`) | Black: `00000` • Red `0.1`: `.3` | `No. KW2151075721`, `10000 1000 100 10 1 0.1`, `1600imp/kWh` | **`0.3 kWh`** |
| **Cirtech `MT-60i` (`CL-60`)** *(No: 22501329)* | Digital LCD Screen (ERC Approved) | Blank / Unpowered LCD Screen | `No: 22501329`, `1600imp/kWh`, `240V`, `10(60)A` | **`0.0 kWh`** *(Blank LCD)* |

---

## 📖 Step-by-Step Landlord Operating Instructions

### Step 1: Configure Property Rate & Security (`Settings`)
1. Open **Settings** from the navigation sidebar.
2. Set your **Property Name** (default: `4Rent Management System`), **Default Monthly Room Rent (`₱`)**, and **Global Electric Sub-Meter Rate (`₱/kWh`)**.
3. Click **Save Property Settings**.
4. Under **Desktop Security (4-Digit Passcode PIN)**, set your personal 4-digit landlord PIN and choose an **Idle Auto-Lock Inactivity Timer** (`5`, `15`, or `30` minutes).

### Step 2: Add Rooms & Onboard Tenants (`Rooms`)
1. Go to **Rooms** and click **Add New Room**.
2. Enter the **Room Name** (e.g., `Room 101`), **Monthly Rent**, **Security Deposit**, and **Current Sub-Meter Reading (`kWh`)**.
3. When a tenant moves in, switch the room status to **Occupied** and fill in:
   - **Tenant Full Name** & **Mobile Number** (auto-formats as `09XX-XXX-XXXX`)
   - **Emergency Contact Name & Phone**
   - **Preferred Payment Due Day** (strictly enforced within the **Day 1 to Day 10** monthly billing window)
   - Check **Government Valid ID Verified** and **Data Privacy & Lease Consent (RA 10173)**

### Step 3: Scan Electric Sub-Meters & Generate Official Receipts (`Scan Meter`)
1. Click **Scan Sub-Meter** on any Room Card.
2. Select the **Billing Period** from the dropdown.
3. Upload or capture photos for **Sub-Meter #1 (Previous Reading)** and **Sub-Meter #2 (Current Reading)**.
4. Review the **Sub-Meter Hardware & Register Inspection Breakdown** and click **Save Room Receipt (With 2 Sub-Meter Proofs)**.

### Step 4: Share Receipts & Record Payments (`Payment History`)
1. Click any generated bill or Room Receipt button to open the **Official Receipt Modal**.
2. Click **Print / Save PDF** to print a clean receipt, or click **Copy Summary & Open Messenger** to send the itemized bill directly to the tenant.
3. Record a **Full Payment**, **Partial Payment** (remaining balance carries over automatically), or **Overpayment** (excess amount is automatically credited to the tenant's withdrawable **Advance Payment Balance**).

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

$$\Delta \text{Consumption (kWh)} = \text{Current Sub-Meter Reading} - \text{Previous Sub-Meter Reading}$$

$$\text{Electric Sub-Total (₱)} = \Delta \text{Consumption (kWh)} \times \text{Global Settings Rate (₱/kWh)}$$

$$\text{Total Amount Due (₱)} = \text{Base Rent} + \text{Electric Sub-Total} + \text{Previous Unpaid Balance} - \text{Advance Credit Applied}$$

---

## 📁 Clean Repository Structure

```text
4Rent/
├── 4Rent Launcher.bat                  # 1-Click Windows Desktop Launcher & Shortcut Creator
├── start-4rent.sh                      # macOS / Linux Local Server Launcher
├── capacitor.config.json               # Capacitor Native Bridge Configuration (v1.0.0)
├── electron/
│   └── main.cjs                        # Native Electron Desktop Window Wrapper
├── mobile_app/                         # Native Flutter & iOS Swift Mobile Application (v1.0.0)
│   ├── Build-Mobile-APK.bat            # 1-Click Android Release APK Builder
│   ├── pubspec.yaml                    # Flutter Dependencies (Supabase Realtime, MLKit OCR)
│   ├── android/                        # Native Android Manifest & Package Config
│   ├── ios/                            # Native iOS Swift Runner Info.plist Config
│   └── lib/main.dart                   # Full Mobile App with Live Desktop Sync
├── public/
│   ├── 4rent-icon.ico                  # Desktop Application Icon
│   ├── icon.svg                        # Scalable Brand Vector Logo
│   ├── icon-192.png & icon-512.png     # Application Icons
│   ├── manifest.webmanifest            # Application Manifest
│   └── sw.js                           # Offline Asset Cache Worker (v1.0.0)
├── src/
│   ├── components/                     # Spacious Desktop & Responsive UI Components
│   ├── services/                       # Calibrated Sub-Meter OCR, IndexedDB & Supabase Realtime Sync
│   ├── types/                          # TypeScript Interfaces (rental.ts)
│   └── utils/                          # Billing Engine & Privacy Masking Utilities
└── supabase/
    └── migrations/                     # Cloud Sync SQL Schema (four_rent_sync)
```

---

## 💻 Developer Setup & Scripts

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Launch in Electron desktop window
npm run electron

# 4. Build production bundle (TypeScript + Vite)
npm run build
```

---

## 📄 License

Distributed under the **MIT License**. Developed by **[splikaa](https://github.com/splikaa)**. See [`LICENSE`](./LICENSE) for full details.
