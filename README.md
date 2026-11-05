# 4Rent — Desktop & Mobile Apartment Rental & OCR Sub-Meter Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Logo" />
</p>

<p align="center">
  <strong>A modern, offline-first & cloud-synced Progressive Web Application (PWA) for apartment landlords and property managers.</strong><br/>
  Features an integrated <strong>OCR Electric Sub-Meter Reader</strong>, automated kWh difference & billing calculator, partial payment balance carry-over, printable receipts, and one-click <strong>Facebook Messenger</strong> sharing.
</p>

---

## Why 4Rent? (System Purpose & Reasoning)

Managing multi-unit apartment rentals often involves tedious, error-prone monthly tasks: manually reading room sub-meters, subtracting previous kilowatt-hour ($\text{kWh}$) readings, multiplying by fluctuating utility rates, tracking partial tenant payments or unpaid carry-over balances, and writing paper receipts by hand.

**4Rent (`v1.0.0`)** was engineered to solve these exact pain points across **both Desktop and Mobile devices**:

1. **Eliminate Sub-Meter Reading & Math Errors (OCR Engine)**:
   - Instead of writing down meter numbers on paper and calculating differences on a calculator, 4Rent provides an **Interactive Sub-Meter Camera & Photo OCR Scanner** powered by `Tesseract.js` and an HTML5 Canvas contrast preprocessor.
   - It automatically extracts the current $\text{kWh}$ reading, subtracts the room's stored previous reading, multiplies the difference ($\Delta \text{kWh}$) by the configured rate ($\text{₱/kWh}$), and attaches a cropped snapshot of the sub-meter reading directly onto the tenant's receipt as visual proof.
2. **Seamless Partial Payment & Balance Carry-Over Accounting**:
   - Tenants frequently pay in installments (e.g., paying base rent first and electric later). 4Rent tracks every transaction per bill and automatically carries over any remaining unpaid balance to the room's ledger for the next billing cycle, alongside **Security Deposit** and **Advance Rent** tracking.
3. **Instant Printable & Messenger-Ready Official Receipts**:
   - Landlords communicate with tenants primarily through **Facebook Messenger** or printed slips. 4Rent generates a high-resolution **PNG Receipt Image**, a **Formatted Messenger Billing Summary**, and a **Print-Ready Thermal (80mm) / A4 PDF Receipt** in a single tap.
4. **Unified Desktop + Mobile Experience (Offline-First + Supabase Cloud Sync)**:
   - Designed with a high-contrast **Obsidian & Warm Amber (`#0B0E14` / `#F59E0B`)** theme that adapts from a touch-friendly mobile navigation drawer to a multi-column desktop workspace.
   - Works **100% offline** using local browser persistence (`IndexedDB` / `localStorage`) with portable `.JSON` backups, and optionally syncs in real time across Desktop and Mobile via **Supabase Cloud Sync**.

---

## Core Billing Formula

For every billing cycle, **4Rent** computes the tenant's statement using the following formula:

$$\Delta \text{Consumption (kWh)} = \text{Current Sub-Meter Reading} - \text{Previous Sub-Meter Reading}$$

$$\text{Electric Sub-Total (₱)} = \Delta \text{Consumption (kWh)} \times \text{Rate per kWh (₱)}$$

$$\text{Total Amount Due (₱)} = \text{Monthly Base Rent} + \text{Electric Sub-Total} + \text{Previous Unpaid Balance} - \text{Applied Deposit/Credits}$$

When a bill is generated, the room's `lastMeterReading` automatically advances to the new `Current Sub-Meter Reading` so next month's billing cycle is ready automatically.

---

## Key Features

- **🔐 Biometric Fingerprint & 4-Digit Passcode PIN Security**:
  - Protect your rental data with device biometrics (**WebAuthn** Fingerprint / FaceID / Windows Hello) or a custom 4-digit numeric Passcode PIN.
- **⚡ Clear OCR Sub-Meter Reader**:
  - Live Rear Camera scanner with a **Sub-Meter Digit Crop Guide**, photo upload scanner, and a built-in **Simulated Sub-Meter OCR Generator** for testing.
- **🏠 Complete Room, Tenant & Lease History Management**:
  - Track room occupancy (`Occupied` / `Vacant`), monthly rent, per-room electric rate, security deposit, advance rent, tenant contact details, Messenger username (`m.me/<username>`), and archived move-in/move-out history.
- **🧾 Printable Receipt & Messenger Integration Studio**:
  - Switch between **4Rent Dark Digital Card** and **Paper White Print** themes.
  - **Share to Messenger**: Uses the native mobile Web Share API (`navigator.share`) to attach the PNG receipt directly to Messenger, or downloads the PNG + copies the formatted summary + opens `m.me/<tenant>` on Desktop.
  - **Print / Save PDF**: Built-in print stylesheet (`@media print`) for standard printers and thermal receipt printers.
- **📊 Dashboard & Consumption Analytics**:
  - Real-time KPI cards (`Total`, `Occupied`, `Vacant`), collection efficiency progress bar, `TOTAL PAID (REVENUE)` vs. `TOTAL UNPAID (DUE)`, and per-room $\text{kWh}$ consumption charts.
- **🔔 Due-Date & Unpaid Balance Notification Reminders**:
  - Browser Notification API integration that alerts you about unpaid tenant balances and upcoming monthly due days.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 18 + TypeScript + Vite 6 |
| **Styling & Theme** | Tailwind CSS v4 (Custom Obsidian `#0B0E14` & Amber `#F59E0B` Design System) |
| **OCR Engine** | Tesseract.js v5 + HTML5 Canvas Auto-Crop & Contrast Binarization |
| **Receipt Image Export** | `html-to-image` (2.5x Retina PNG export) + Native `@media print` CSS |
| **Icons** | Lucide React (`lucide-react`) + Custom SVG Brand Assets |
| **Persistence & Sync** | LocalStorage / Offline Snapshot + `@supabase/supabase-js` Cloud Sync |
| **Testing** | Vitest (`src/utils/billingCalculator.test.ts`) |

---

## Getting Started (Installation & Usage)

### Prerequisites
- **Node.js** `v18+` (or `v22 LTS`) and `npm`

### 1. Clone the Repository
```bash
git clone https://github.com/splikaa/4Rent.git
cd 4Rent
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Development Server (Desktop & Mobile Wi-Fi Access)
```bash
npm run dev
```
- **On Windows**: You can also simply double-click **`Start-4Rent.bat`** in the project root to launch the server and open `http://localhost:5173` automatically.
- **On Mobile**: Open the Network URL printed in the terminal (e.g., `http://192.168.x.x:5173`) on your phone's browser and tap **"Add to Home Screen"** to install **4Rent** as a standalone mobile app.

### 4. Run Unit Tests & Production Build
```bash
# Run the Vitest unit test suite for the OCR & Billing Calculator
npm run test

# Build optimized production bundle into dist/
npm run build
```

---

## Optional: Enabling Supabase Cloud Sync (Desktop ↔ Mobile)

**4Rent** works 100% offline right out of the box. If you want your Desktop and Mobile devices to sync automatically over the cloud:

1. Create a free project at [supabase.com](https://supabase.com) and open the **SQL Editor**.
2. Run the following SQL setup script (also available via the **"Copy Supabase SQL Setup"** button inside **4Rent → Settings**):
   ```sql
   create table if not exists public.four_rent_sync (
     property_code text primary key,
     snapshot jsonb not null,
     updated_at timestamptz not null default now()
   );

   alter table public.four_rent_sync enable row level security;

   create policy "Allow public sync access by property_code"
     on public.four_rent_sync
     for all
     using (true)
     with check (true);
   ```
3. In **4Rent → Settings → Supabase Cloud Sync**, paste your **Supabase Project URL**, **Anon Public Key**, and a shared **Property Sync Code** (e.g., `4RENT-MAIN`), then click **Push Local Data to Cloud**.

---

## Project Structure

```text
4Rent/
├── public/
│   ├── icon.svg                         # 4Rent vector brand icon
│   └── manifest.webmanifest             # PWA installable manifest
├── src/
│   ├── components/
│   │   ├── BrandLogo.tsx                # 4Rent glowing squircle logo
│   │   ├── dashboard/DashboardView.tsx  # KPI cards, room grid & kWh analytics
│   │   ├── layout/NavigationDrawer.tsx  # Mobile drawer & Desktop persistent sidebar
│   │   ├── modals/EnableRemindersModal.tsx
│   │   ├── ocr/SubMeterScannerModal.tsx # Camera/Upload/Simulated OCR Sub-Meter Reader
│   │   ├── payments/AllPaymentsView.tsx # Revenue summary, filters & partial payments
│   │   ├── receipt/ReceiptModal.tsx     # PNG download, Print PDF & Messenger integration
│   │   ├── rooms/ManageRoomsView.tsx    # Room CRUD & tenant move-out history
│   │   ├── rooms/RoomFormModal.tsx
│   │   ├── security/LockScreen.tsx      # PIN keypad & WebAuthn biometric unlock
│   │   ├── security/SecuritySetupScreen.tsx
│   │   └── settings/SettingsView.tsx    # Rates, Backup JSON & Supabase Cloud Sync
│   ├── services/
│   │   ├── ocrService.ts                # Tesseract.js OCR & WebAuthn helpers
│   │   ├── storageService.ts            # Local persistence & demo data generator
│   │   └── supabaseSync.ts              # Two-way cloud sync service
│   ├── types/rental.ts                  # Core TypeScript domain models
│   ├── utils/
│   │   ├── billingCalculator.ts         # Sub-meter difference & billing engine
│   │   └── billingCalculator.test.ts    # Vitest unit tests
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── Start-4Rent.bat                      # 1-click Windows launcher
├── LICENSE                              # MIT License
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for full details.
