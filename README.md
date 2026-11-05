# 4Rent • Desktop & Mobile Apartment Rental & Dual Sub-Meter Management System

<p align="center">
  <img src="public/icon.svg" width="110" height="110" alt="4Rent Logo" />
</p>

<p align="center">
  <strong>A modern, cross-OS (MacBook, Windows, Linux, iOS & Android) Progressive Web Application (PWA) for apartment landlords and property managers.</strong><br/>
  <strong>Version: v1.2.0 • Developed by <a href="https://github.com/splikaa">splikaa</a></strong><br/>
  <strong>🌐 Instant Live App (Works on Any OS/Device): <a href="https://splikaa.github.io/4Rent/">https://splikaa.github.io/4Rent/</a></strong>
</p>

---

## Desktop Installer & Developer-Integrated Cloud Sync (`v1.2.0`)

1. **1-Click Desktop Installer (`Install-4Rent-Desktop.bat`)**:
   - Double-click `Install-4Rent-Desktop.bat` (or click **Install 4Rent for Desktop** inside **Settings**) to install a native Desktop shortcut and window for the landlord.
   - **MacBook / iOS / Android**: Open **[https://splikaa.github.io/4Rent/](https://splikaa.github.io/4Rent/)** and choose **Add to Dock** or **Add to Home Screen**.
2. **Persistent Update-Safe Database (`IndexedDB` + `LocalStorage` + Cloud Sync)**:
   - All rooms, continuous sub-meter readings, receipts, bookings, and tenant history are stored in a version-independent `IndexedDB` (`FourRentPersistentDatabase`) + `LocalStorage` + developer-integrated Cloud Sync so updating the application **never resets or alters existing landlord data**.

---

## Core System Features (`v1.2.0`)

1. **Enhanced 2× Super-Resolution De-Blur Sub-Meter OCR**:
   - Uses 2× super-resolution upscaling, a 3×3 unsharp mask convolution kernel, and dynamic histogram contrast stretching so even blurry sub-meter photos are read accurately.
   - Includes a selectable **Billing Period** dropdown (no manual typing required).
2. **Dual Electric Sub-Meter Proofs on Every Official Receipt (`2 Sub-Meters`)**:
   - Every Official Receipt displays **Sub-Meter #1 (Previous)** and **Sub-Meter #2 (Current)** side-by-side along with:
     $$\Delta \text{Consumption (kWh)} = \text{Current Reading} - \text{Previous Reading}$$
     $$\text{Electric Sub-Total (₱)} = \Delta \text{Consumption (kWh)} \times \text{Global Settings Rate (₱/kWh)}$$
3. **Auto Next-Month Payment Due Date (Strictly Day 1 to Day 10)**:
   - Automatically schedules the next month's payment due date strictly within **Day 1 to Day 10** of the month.
4. **Auto-Formatted Mobile Numbers**:
   - Automatically formats mobile numbers as `09XX-XXX-XXXX` while typing.
5. **Clickable Room Cards for Details & Previous Transactions**:
   - Clicking any Room Card opens the **Room Details & Transactions Modal**, displaying the room's profile, active receipt, advance payment ledger, all previous billing transactions, and previous tenants.
6. **Vacant-Only Room Booking Filter**:
   - Occupied rooms are automatically hidden in the **Room Inquiries & Bookings** selector so only `Vacant` rooms can be booked.
7. **Desktop PIN-Only Security (Mobile Biometrics + PIN)**:
   - Desktop devices display **4-Digit Passcode PIN** authentication only (hiding mobile fingerprint prompts on Desktop).

---

## Running Locally (Windows, macOS & Linux)

```bash
git clone https://github.com/splikaa/4Rent.git
cd 4Rent
npm install
npm run dev
```
- **Install Desktop App (Windows)**: Double-click `Install-4Rent-Desktop.bat`
- **Start Local Dev Server (Windows)**: Double-click `Start-4Rent.bat`
- **MacBook / Linux**: Run `chmod +x start-4rent.sh && ./start-4rent.sh`

---

## License

Distributed under the **MIT License**. Developed by **splikaa**. See [`LICENSE`](./LICENSE) for full details.
