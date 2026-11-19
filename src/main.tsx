import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Ensure clean system title everywhere
document.title = '4Rent Management System';

// Detect standalone runtime cleanly for Desktop (Electron/Windows/macOS) vs Mobile (iOS Home Screen / Android APK)
try {
  const params = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent || '';
  const isIosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const isMobileUa =
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const isElectron = /Electron/i.test(ua);
  const isStandaloneDisplay =
    isIosStandalone ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    isElectron ||
    params.get('desktop') === '1' ||
    params.get('app') === '1';

  if (isStandaloneDisplay) {
    if (isIosStandalone || (isMobileUa && !isElectron)) {
      localStorage.setItem('4rent_mobile_installed', 'true');
      document.documentElement.classList.add('ios-pwa-standalone');
    } else {
      localStorage.setItem('4rent_desktop_installed', 'true');
    }
  }
} catch {
  // Ignore storage restrictions
}

// Register Service Worker for Web & Mobile PWA (iOS Safari Home Screen & Android) support
// Skip on file:// protocol (packaged Electron desktop app loads local dist assets directly)
if (
  'serviceWorker' in navigator &&
  window.location.protocol !== 'file:'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Non-blocking in local dev
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
