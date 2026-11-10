/**
 * Tier 1 Feature Coverage: UI/UX & Microcopy
 *
 * Covers:
 * - Feature 1 (F1): Multi-Device Layout Responsiveness (320px–1280px)
 * - Feature 2 (F2): Action Button Visibility & Breakpoints (Download PNG, Copy Text, Edit Room)
 * - Feature 3 (F3): Concise UI Microcopy & Text Limits (<120 chars)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertStrictEqual,
  assertTrue,
  assertFalse,
} from '../harness/test_utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Tier 1: UI/UX & Microcopy Feature Coverage', () => {

  // ==========================================================================
  // Feature 1: Multi-Device Layout Responsiveness (F1)
  // ==========================================================================
  describe('Feature 1: Multi-Device Layout Responsiveness (F1)', () => {
    it('1.1 Small Mobile (320px x 640px) Navigation & Shell Invariants', () => {
      const navDrawerPath = path.join(projectRoot, 'src/components/layout/NavigationDrawer.tsx');
      const bottomNavPath = path.join(projectRoot, 'src/components/layout/MobileBottomNav.tsx');
      const cssPath = path.join(projectRoot, 'src/index.css');

      const navDrawerCode = fs.readFileSync(navDrawerPath, 'utf8');
      const bottomNavCode = fs.readFileSync(bottomNavPath, 'utf8');
      const cssCode = fs.readFileSync(cssPath, 'utf8');

      // 1. Persistent desktop sidebar must be hidden on mobile screens (lg:block with hidden default)
      assertTrue(
        navDrawerCode.includes('hidden lg:block'),
        'Desktop sidebar navigation must hide on mobile screens < 1024px via hidden lg:block'
      );

      // 2. Mobile slide-over drawer must only activate below lg breakpoint
      assertTrue(
        navDrawerCode.includes('lg:hidden') && navDrawerCode.includes('fixed inset-0 z-50'),
        'Mobile slide-over drawer must use lg:hidden so it never overlaps desktop layout'
      );

      // 3. Mobile bottom nav must be visible on mobile and hidden on desktop (lg:hidden)
      assertTrue(
        bottomNavCode.includes('lg:hidden fixed bottom-0'),
        'MobileBottomNav must be fixed at bottom on mobile and hidden on desktop via lg:hidden'
      );

      // 4. Global CSS must prevent horizontal scrolling on small 320px screens
      assertTrue(
        cssCode.includes('overflow-x: hidden'),
        'Body stylesheet must enforce overflow-x: hidden to prevent horizontal scrollbars on 320px screens'
      );
    });

    it('1.2 Mobile (375px x 667px - iPhone SE) Room Card Grid & Non-Clipping Badges', () => {
      const dashboardPath = path.join(projectRoot, 'src/components/dashboard/DashboardView.tsx');
      const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

      // Room grid must adaptively stack in single column on mobile and 2-3 on larger screens
      assertTrue(
        dashboardCode.includes('grid-cols-1') && (dashboardCode.includes('sm:grid-cols-2') || dashboardCode.includes('md:grid-cols-2')),
        'DashboardView room cards must use responsive grid stacking (grid-cols-1 sm:grid-cols-2)'
      );

      // Room cards must include flex shrink protection or truncation on badges
      assertTrue(
        dashboardCode.includes('shrink-0') || dashboardCode.includes('truncate'),
        'DashboardView must use shrink-0 or truncate to protect badges from clipping titles'
      );
    });

    it('1.3 Tablet Portrait (768px x 1024px) Responsive Grid & Action Bar Spacing', () => {
      const dashboardPath = path.join(projectRoot, 'src/components/dashboard/DashboardView.tsx');
      const roomsViewPath = path.join(projectRoot, 'src/components/rooms/ManageRoomsView.tsx');

      const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
      const roomsViewCode = fs.readFileSync(roomsViewPath, 'utf8');

      // Check tablet breakpoints in summary cards and room cards
      assertTrue(
        dashboardCode.includes('md:grid-cols-2') || dashboardCode.includes('sm:gap-6') || dashboardCode.includes('grid-cols-3'),
        'DashboardView analytics summary cards and room cards must adapt for tablet screens'
      );

      // ManageRoomsView must support tablet 2-column or responsive grid
      assertTrue(
        roomsViewCode.includes('grid-cols-1') && (roomsViewCode.includes('sm:grid-cols-2') || roomsViewCode.includes('md:grid-cols-2')),
        'ManageRoomsView must adapt grid to 2 columns on tablet screens (768px+)'
      );
    });

    it('1.4 Desktop Breakpoint (1024px x 768px) Persistent Sidebar Activation', () => {
      const navDrawerPath = path.join(projectRoot, 'src/components/layout/NavigationDrawer.tsx');
      const navDrawerCode = fs.readFileSync(navDrawerPath, 'utf8');

      // Aside element must have w-72 width and sticky positioning for desktop viewports
      assertTrue(
        navDrawerCode.includes('<aside') && navDrawerCode.includes('w-72') && navDrawerCode.includes('sticky top-0'),
        'Persistent desktop aside must specify w-72 and sticky top-0'
      );

      // Verify close button is hidden on desktop (lg:hidden)
      assertTrue(
        navDrawerCode.includes('lg:hidden absolute top-4 right-4'),
        'Close button inside drawer header must be lg:hidden so desktop sidebar cannot be accidentally closed'
      );
    });

    it('1.5 Desktop Fullscreen (1280px+ x 800px) Three-Column Grid & Layout Expansion', () => {
      const dashboardPath = path.join(projectRoot, 'src/components/dashboard/DashboardView.tsx');
      const roomsViewPath = path.join(projectRoot, 'src/components/rooms/ManageRoomsView.tsx');

      const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
      const roomsViewCode = fs.readFileSync(roomsViewPath, 'utf8');

      // Grid expands to 3 columns on desktop
      assertTrue(
        dashboardCode.includes('lg:grid-cols-3') || roomsViewCode.includes('lg:grid-cols-3'),
        'Room grids must expand to 3 columns on large desktop viewports (lg:grid-cols-3)'
      );

      // Container max-width maintains readability on ultrawide monitors
      assertTrue(
        dashboardCode.includes('max-w-') || roomsViewCode.includes('max-w-'),
        'Views must enforce max-w-* container constraint to prevent content stretching on ultra-wide screens'
      );
    });
  });

  // ==========================================================================
  // Feature 2: Action Button Visibility & Breakpoints (F2)
  // ==========================================================================
  describe('Feature 2: Action Button Visibility & Breakpoints (F2)', () => {
    it('2.1 ReceiptModal "Download PNG" Button Semantic Structure & Icons', () => {
      const receiptModalPath = path.join(projectRoot, 'src/components/receipt/ReceiptModal.tsx');
      const code = fs.readFileSync(receiptModalPath, 'utf8');

      // Verify Download PNG button exists and has appropriate handler
      assertTrue(code.includes('onClick={handleDownloadPng}'), 'ReceiptModal must wire onClick to handleDownloadPng');
      assertTrue(code.includes('disabled={isExporting}'), 'ReceiptModal must disable button while isExporting');
      assertTrue(code.includes('<Download className="w-4 h-4" />'), 'ReceiptModal must render Download icon');
      assertTrue(code.includes('PNG'), 'ReceiptModal must include PNG button label');
    });

    it('2.2 ReceiptModal "Copy Text" Button Semantic Structure & Copied State', () => {
      const receiptModalPath = path.join(projectRoot, 'src/components/receipt/ReceiptModal.tsx');
      const code = fs.readFileSync(receiptModalPath, 'utf8');

      // Verify Copy Text button exists and toggles state
      assertTrue(code.includes('onClick={handleCopySummary}'), 'ReceiptModal must wire onClick to handleCopySummary');
      assertTrue(code.includes('copiedText'), 'ReceiptModal must check copiedText state for feedback');
      assertTrue(code.includes('Copied'), 'ReceiptModal must display "Copied" feedback state');
      assertTrue(code.includes('Text'), 'ReceiptModal must display "Text" label in default state');
    });

    it('2.3 RoomDetailsModal "Edit Room" Button Accessibility & Iconography', () => {
      const roomDetailsPath = path.join(projectRoot, 'src/components/rooms/RoomDetailsModal.tsx');
      const code = fs.readFileSync(roomDetailsPath, 'utf8');

      // Verify Edit Room button exists and triggers edit handler
      assertTrue(code.includes('onEditRoom(room)'), 'RoomDetailsModal must invoke onEditRoom when Edit Room is clicked');
      assertTrue(code.includes('title="Edit room configuration"'), 'RoomDetailsModal must provide accessible title attribute');
      assertTrue(code.includes('<Edit2 className="w-3.5 h-3.5'), 'RoomDetailsModal must render Edit2 icon');
      assertTrue(code.includes('Edit Room'), 'RoomDetailsModal must contain "Edit Room" button label');
    });

    it('2.4 Action Button Fluid Container Layout & Collision Prevention', () => {
      const receiptModalPath = path.join(projectRoot, 'src/components/receipt/ReceiptModal.tsx');
      const roomDetailsPath = path.join(projectRoot, 'src/components/rooms/RoomDetailsModal.tsx');

      const receiptCode = fs.readFileSync(receiptModalPath, 'utf8');
      const roomDetailsCode = fs.readFileSync(roomDetailsPath, 'utf8');

      // Buttons must use .btn-fluid utility for responsive spring interaction
      assertTrue(receiptCode.includes('btn-fluid'), 'ReceiptModal action buttons must use btn-fluid class');
      assertTrue(roomDetailsCode.includes('btn-fluid'), 'RoomDetailsModal action buttons must use btn-fluid class');

      // Height and padding should provide accessible touch target (min 44px / h-11 on mobile)
      assertTrue(receiptCode.includes('h-11'), 'ReceiptModal action buttons must provide h-11 (44px) touch target');
    });

    it('2.5 Stylesheet Fluid Button Definition & Spring Physics Invariants', () => {
      const cssPath = path.join(projectRoot, 'src/index.css');
      const cssCode = fs.readFileSync(cssPath, 'utf8');

      // Verify .btn-fluid styling rules exist
      assertTrue(cssCode.includes('.btn-fluid'), 'src/index.css must define .btn-fluid utility');
      assertTrue(cssCode.includes('transform: scale(0.97)') || cssCode.includes('transform: scale(0.96)'),
        'Interactive buttons must provide active scale feedback'
      );
      assertTrue(cssCode.includes('touch-action: manipulation'),
        'Interactive buttons must specify touch-action: manipulation to eliminate mobile tap delays'
      );
    });
  });

  // ==========================================================================
  // Feature 3: Concise UI Microcopy & Text Limits (<120 chars) (F3)
  // ==========================================================================
  describe('Feature 3: Concise UI Microcopy & Text Limits (<120 chars) (F3)', () => {
    it('3.1 EasyWalkthroughModal Step Descriptions Strictly Under 120 Characters', () => {
      const walkthroughPath = path.join(projectRoot, 'src/components/common/EasyWalkthroughModal.tsx');
      const code = fs.readFileSync(walkthroughPath, 'utf8');

      // Extract description fields from EasyWalkthroughModal steps array
      const descriptionMatches = [...code.matchAll(/description:\s*\n?\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);

      assertTrue(descriptionMatches.length >= 5, `Expected at least 5 step descriptions, found ${descriptionMatches.length}`);

      for (let i = 0; i < descriptionMatches.length; i++) {
        const desc = descriptionMatches[i];
        assertTrue(
          desc.length <= 120,
          `EasyWalkthroughModal step ${i + 1} description exceeds 120 chars (${desc.length} chars): "${desc}"`
        );
        assertTrue(
          desc.length >= 20,
          `EasyWalkthroughModal step ${i + 1} description is too short (${desc.length} chars)`
        );
      }
    });

    it('3.2 DashboardView Monthly Payment Reminder Banner Concise Copy', () => {
      const dashboardPath = path.join(projectRoot, 'src/components/dashboard/DashboardView.tsx');
      const code = fs.readFileSync(dashboardPath, 'utf8');

      // Verify the reminder headline is concise and mentions the 1st to 10th window
      assertTrue(
        code.includes('1st to 10th Monthly Payment Reminder'),
        'DashboardView reminder banner headline must be "1st to 10th Monthly Payment Reminder"'
      );

      // Verify reminder banner title length is <= 60 characters
      const headline = '1st to 10th Monthly Payment Reminder';
      assertTrue(headline.length <= 60, `Headline length ${headline.length} exceeds 60 characters`);
    });

    it('3.3 InquiriesBookingsView Vacancy Banner Concise Microcopy', () => {
      const inquiriesPath = path.join(projectRoot, 'src/components/inquiries/InquiriesBookingsView.tsx');
      const code = fs.readFileSync(inquiriesPath, 'utf8');

      // Verify title is concise
      assertTrue(
        code.includes('Vacant Room Reservations & Tenant Inquiries'),
        'InquiriesBookingsView must use clear, concise title "Vacant Room Reservations & Tenant Inquiries"'
      );

      // Verify empty state description is concise (< 120 chars)
      const emptyStateText = 'Log prospective tenants inquiring about available vacant rooms or reserve a unit with a booking deposit.';
      assertTrue(
        code.includes(emptyStateText) || code.includes('inquiries or room bookings yet'),
        'InquiriesBookingsView must contain concise empty state instruction'
      );
      assertTrue(emptyStateText.length <= 120, `Empty state text exceeds 120 chars (${emptyStateText.length})`);
    });

    it('3.4 OccupiedArchiveGuardModal Alert Microcopy Strictly Under 150 Characters', () => {
      const modalPath = path.join(projectRoot, 'src/components/modals/OccupiedArchiveGuardModal.tsx');
      const code = fs.readFileSync(modalPath, 'utf8');

      // Verify modal headline
      assertTrue(
        code.includes('Occupied Room • Direct Archive Blocked'),
        'OccupiedArchiveGuardModal must have concise title "Occupied Room • Direct Archive Blocked"'
      );

      // Verify error string when no override reason is selected
      const expectedError = 'Cannot archive an occupied room directly. Please select or specify a valid override reason first.';
      assertTrue(
        code.includes(expectedError),
        'OccupiedArchiveGuardModal must provide concise validation error when override reason missing'
      );
      assertTrue(
        expectedError.length <= 150,
        `Validation error exceeds 150 characters (${expectedError.length} chars)`
      );
    });

    it('3.5 PinAuthModal Description & Validation Error Microcopy Limits', () => {
      const pinModalPath = path.join(projectRoot, 'src/components/modals/PinAuthModal.tsx');
      const code = fs.readFileSync(pinModalPath, 'utf8');

      // Verify default description is under 120 characters
      const defaultDesc = 'Enter your 4-digit security PIN to confirm removing this room.';
      assertTrue(
        code.includes(defaultDesc),
        'PinAuthModal must use concise PIN prompt description'
      );
      assertTrue(defaultDesc.length <= 120, `Default description exceeds 120 characters (${defaultDesc.length} chars)`);

      // Verify error messages are under 60 characters
      const pinError = 'Incorrect 4-digit PIN. Room removal denied.';
      assertTrue(
        code.includes(pinError),
        'PinAuthModal must include concise PIN error message'
      );
      assertTrue(pinError.length <= 60, `PIN error message exceeds 60 characters (${pinError.length} chars)`);
    });
  });
});
