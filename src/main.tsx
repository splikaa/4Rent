import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Ensure clean system title everywhere
document.title = '4Rent Management System';

// Mark desktop version as installed when launched via Desktop Launcher, Electron, or standalone window
try {
  const params = new URLSearchParams(window.location.search);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    /Electron/i.test(navigator.userAgent || '') ||
    params.get('desktop') === '1' ||
    params.get('app') === '1';

  if (isStandalone) {
    localStorage.setItem('4rent_desktop_installed', 'true');
  }
} catch {
  // Ignore storage restrictions
}

// Register Service Worker for Mobile App (iOS & Android PWA) support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
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
