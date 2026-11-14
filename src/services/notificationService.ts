/**
 * Notification Verification & Messenger Receipt Forwarding Service.
 */

export async function requestAndVerifyNotifications(): Promise<{
  granted: boolean;
  verified: boolean;
  message: string;
}> {
  const win = window as unknown as {
    AndroidNative?: {
      requestAndVerifyNotification?: (title: string, body: string) => boolean;
      areNotificationsEnabled?: () => boolean;
    };
    __onAndroidNotificationPermissionResult?: (granted: boolean) => void;
  };

  // 1. Native Android APK Bridge
  if (win.AndroidNative && typeof win.AndroidNative.requestAndVerifyNotification === 'function') {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: { granted: boolean; verified: boolean; message: string }) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        delete win.__onAndroidNotificationPermissionResult;
        resolve(result);
      };

      timer = setTimeout(() => {
        const enabled = win.AndroidNative?.areNotificationsEnabled?.() ?? false;
        finish({
          granted: enabled,
          verified: enabled,
          message: enabled
            ? 'Notification permission verified on your phone!'
            : 'Please allow 4Rent notifications in your phone Settings.',
        });
      }, 6000);

      win.__onAndroidNotificationPermissionResult = (granted: boolean) => {
        finish({
          granted,
          verified: granted,
          message: granted
            ? 'Notification permission granted & verified! Check your status bar.'
            : 'Notification permission was denied. Please enable it in App Settings.',
        });
      };

      try {
        const immediate = win.AndroidNative!.requestAndVerifyNotification!(
          '4Rent Notifications Verified ✓',
          'Day 1-10 billing & due-date alerts are active on this device.'
        );
        if (immediate) {
          finish({
            granted: true,
            verified: true,
            message: 'Notification permission verified! Test alert sent to your phone.',
          });
        }
      } catch {
        finish({
          granted: false,
          verified: false,
          message: 'Could not verify notification permission on mobile.',
        });
      }
    });
  }

  // 2. Desktop / Mobile Web Browser Notification API
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      let perm = Notification.permission;
      if (perm !== 'granted') {
        perm = await Notification.requestPermission();
      }
      if (perm === 'granted') {
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && typeof reg.showNotification === 'function') {
              await reg.showNotification('4Rent Notifications Verified ✓', {
                body: 'Day 1-10 billing & due-date reminders are active.',
                icon: './4rent-logo.svg',
              });
            } else {
              new Notification('4Rent Notifications Verified ✓', {
                body: 'Day 1-10 billing & due-date reminders are active.',
                icon: './4rent-logo.svg',
              });
            }
          } else {
            new Notification('4Rent Notifications Verified ✓', {
              body: 'Day 1-10 billing & due-date reminders are active.',
            });
          }
        } catch {
          // Notification constructed
        }
        return {
          granted: true,
          verified: true,
          message: 'Notification permission granted & verified! Test alert sent.',
        };
      }
      return {
        granted: false,
        verified: false,
        message: 'Notification permission denied. Please allow notifications in browser/system settings.',
      };
    } catch {
      return {
        granted: false,
        verified: false,
        message: 'Could not verify notifications. Please check system notification permissions.',
      };
    }
  }

  return {
    granted: false,
    verified: false,
    message: 'System notifications are not supported in this browser.',
  };
}

/**
 * Official Meta App ID for 4Rent Messenger & Send Dialog Integration
 */
export const META_MESSENGER_APP_ID = '1127838943497464';

export interface ReceiptShareDescriptor {
  pdfFilename: string;
  pngFilename: string;
  shareTitle: string;
  messengerHandle: string;
  requiresManualRecipient: false;
  targetMessengerUrl: string;
}

/**
 * Resolves safe share filenames, titles, and optional Messenger target URL.
 * Sharing NEVER blocks when recipient name or Messenger handle is omitted.
 */
export function buildReceiptShareDescriptor(options: {
  receiptNo?: string;
  tenantName?: string;
  roomName?: string;
  messengerHandle?: string;
}): ReceiptShareDescriptor {
  const cleanHandle = (options.messengerHandle || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?(m\.me|messenger\.com\/t|facebook\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');

  const cleanReceiptNo = (options.receiptNo || 'Receipt').trim();
  const cleanRoom = (options.roomName || 'Room').trim();
  const rawTenant = (options.tenantName || '').trim();
  const lowerTenant = rawTenant.toLowerCase();
  const hasNamedTenant =
    Boolean(rawTenant) &&
    lowerTenant !== 'vacant' &&
    lowerTenant !== 'no active tenant' &&
    lowerTenant !== 'current room tenant';

  const safeReceipt = cleanReceiptNo.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Receipt';
  const safeRoom = cleanRoom.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Room';
  const safeTenant = hasNamedTenant
    ? rawTenant.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
    : '';

  const baseName = safeTenant
    ? `4Rent_Receipt_${safeReceipt}_${safeRoom}_${safeTenant}`
    : `4Rent_Receipt_${safeReceipt}_${safeRoom}`;

  return {
    pdfFilename: `${baseName}.pdf`,
    pngFilename: `${baseName}.png`,
    shareTitle: hasNamedTenant
      ? `4Rent Receipt ${cleanReceiptNo} | ${cleanRoom} | ${rawTenant}`
      : `4Rent Receipt ${cleanReceiptNo} | ${cleanRoom}`,
    messengerHandle: cleanHandle,
    requiresManualRecipient: false,
    targetMessengerUrl: cleanHandle
      ? `https://m.me/${encodeURIComponent(cleanHandle)}`
      : 'https://www.messenger.com/',
  };
}

function triggerBrowserBlobDownload(blob: Blob | null | undefined, dataUrl: string | undefined, filename: string) {
  try {
    let url = dataUrl || '';
    let shouldRevoke = false;
    if (blob) {
      url = URL.createObjectURL(blob);
      shouldRevoke = true;
    }
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (shouldRevoke) {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  } catch {
    // ignore download helper failures
  }
}

/**
 * Shares an official A4 PDF receipt via Android Native Share Sheet / Messenger or Web Share API,
 * or opens Messenger cleanly with the PDF downloaded when browser share APIs don't attach files.
 * Never blocks or prompts for a missing recipient name.
 */
export async function shareReceiptDocument(options: {
  mode: 'share' | 'messenger';
  textSummary?: string;
  pdfBlob?: Blob;
  pdfDataUrl?: string;
  pngDataUrl?: string;
  receiptNo?: string;
  tenantName?: string;
  roomName?: string;
  messengerHandle?: string;
  shareUrl?: string;
  preOpenedWindow?: Window | null;
}): Promise<{ openedApp: boolean; usedPdfAttachment: boolean; message: string }> {
  const {
    mode,
    textSummary = '',
    pdfBlob,
    pdfDataUrl,
    pngDataUrl,
    receiptNo,
    tenantName,
    roomName,
    messengerHandle,
    shareUrl,
    preOpenedWindow,
  } = options;

  const descriptor = buildReceiptShareDescriptor({
    receiptNo,
    tenantName,
    roomName,
    messengerHandle,
  });

  const closeUnusedPreopenedWindow = () => {
    if (preOpenedWindow && !preOpenedWindow.closed) {
      try {
        preOpenedWindow.close();
      } catch {
        // ignore
      }
    }
  };

  if (textSummary && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(textSummary);
    } catch {
      // ignore clipboard permission issues
    }
  }

  const win = window as unknown as {
    AndroidNative?: {
      sharePdfReceipt?: (
        pdfBase64: string,
        filename: string,
        summaryText: string,
        preferMessenger: boolean
      ) => boolean;
      shareToMessenger?: (
        pngBase64: string,
        summaryText: string,
        handle: string
      ) => boolean;
    };
  };

  // 1. Native Android APK Bridge with real PDF content:// attachment (recipient never required)
  if (
    pdfDataUrl &&
    win.AndroidNative &&
    typeof win.AndroidNative.sharePdfReceipt === 'function'
  ) {
    try {
      const launched = win.AndroidNative.sharePdfReceipt(
        pdfDataUrl,
        descriptor.pdfFilename,
        textSummary,
        mode === 'messenger'
      );
      if (launched) {
        closeUnusedPreopenedWindow();
        return {
          openedApp: true,
          usedPdfAttachment: true,
          message:
            mode === 'messenger'
              ? `Opened Messenger / Share Sheet with ${descriptor.pdfFilename} attached.`
              : `Opened share sheet with ${descriptor.pdfFilename} attached.`,
        };
      }
    } catch {
      // fall through to Web Share / legacy fallback
    }
  }

  // 2. Web Share API with real PDF File (Android Chrome / iOS Safari / modern Edge & macOS)
  if (
    pdfBlob &&
    typeof File !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const pdfFile = new File([pdfBlob], descriptor.pdfFilename, {
        type: 'application/pdf',
      });
      const canSharePdf =
        typeof navigator.canShare === 'function'
          ? navigator.canShare({ files: [pdfFile] })
          : true;
      if (canSharePdf) {
        closeUnusedPreopenedWindow();
        await navigator.share({
          files: [pdfFile],
          title: descriptor.shareTitle,
          text: textSummary || descriptor.shareTitle,
        });
        return {
          openedApp: true,
          usedPdfAttachment: true,
          message:
            mode === 'messenger'
              ? `PDF ready (${descriptor.pdfFilename}). Pick Messenger from the share sheet.`
              : `Shared ${descriptor.pdfFilename}.`,
        };
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        closeUnusedPreopenedWindow();
        return {
          openedApp: false,
          usedPdfAttachment: false,
          message: 'Share dismissed.',
        };
      }
    }
  }

  // 3. Fallback: Legacy Android APK PNG share without gating on empty handle
  if (
    pngDataUrl &&
    win.AndroidNative &&
    typeof win.AndroidNative.shareToMessenger === 'function'
  ) {
    try {
      const launched = win.AndroidNative.shareToMessenger(
        pngDataUrl,
        textSummary,
        ''
      );
      if (launched) {
        closeUnusedPreopenedWindow();
        return {
          openedApp: true,
          usedPdfAttachment: false,
          message: 'Opened Android share sheet with receipt attached.',
        };
      }
    } catch {
      // fall through
    }
  }

  // 4. Web Share API with PNG fallback if PDF wasn't supported by older browser
  if (
    pngDataUrl &&
    typeof File !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const res = await fetch(pngDataUrl);
      const imageBlob = await res.blob();
      const pngFile = new File([imageBlob], descriptor.pngFilename, {
        type: 'image/png',
      });
      if (
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [pngFile] })
      ) {
        closeUnusedPreopenedWindow();
        await navigator.share({
          files: [pngFile],
          title: descriptor.shareTitle,
        });
        return {
          openedApp: true,
          usedPdfAttachment: false,
          message: 'Receipt image shared via system share sheet.',
        };
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        closeUnusedPreopenedWindow();
        return {
          openedApp: false,
          usedPdfAttachment: false,
          message: 'Share dismissed.',
        };
      }
    }
  }

  // 5. Desktop / unsupported mobile browser: always download real A4 PDF first, then open Messenger if requested
  if (pdfBlob || pdfDataUrl) {
    triggerBrowserBlobDownload(pdfBlob, pdfDataUrl, descriptor.pdfFilename);
  } else if (pngDataUrl) {
    triggerBrowserBlobDownload(null, pngDataUrl, descriptor.pngFilename);
  }

  if (mode === 'share') {
    closeUnusedPreopenedWindow();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && shareUrl) {
      try {
        await navigator.share({
          title: descriptor.shareTitle,
          text: textSummary || descriptor.shareTitle,
          url: shareUrl,
        });
        return {
          openedApp: true,
          usedPdfAttachment: false,
          message: `Downloaded ${descriptor.pdfFilename} & opened share dialog.`,
        };
      } catch {
        // ignore abort/fallback
      }
    }
    return {
      openedApp: Boolean(pdfBlob || pdfDataUrl || pngDataUrl),
      usedPdfAttachment: Boolean(pdfBlob || pdfDataUrl),
      message: `Saved ${descriptor.pdfFilename} (summary copied to clipboard).`,
    };
  }

  // Messenger destination (works with OR without registered recipient handle)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = isAndroid || isIOS;

  if (isMobile) {
    closeUnusedPreopenedWindow();
    const target = descriptor.messengerHandle
      ? descriptor.targetMessengerUrl
      : isAndroid
      ? `intent://compose#Intent;scheme=fb-messenger;package=com.facebook.orca;S.browser_fallback_url=${encodeURIComponent('https://m.me')};end`
      : `https://m.me/`;
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const a = document.createElement('a');
      a.href = target;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
    return {
      openedApp: true,
      usedPdfAttachment: Boolean(pdfBlob || pdfDataUrl),
      message: `Saved ${descriptor.pdfFilename} & opened Messenger. Select your tenant chat to attach the PDF.`,
    };
  }

  const desktopMessengerUrl = descriptor.targetMessengerUrl;
  if (preOpenedWindow && !preOpenedWindow.closed) {
    try {
      preOpenedWindow.opener = null;
      preOpenedWindow.location.href = desktopMessengerUrl;
    } catch {
      window.open(desktopMessengerUrl, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(desktopMessengerUrl, '_blank', 'noopener,noreferrer');
  }

  return {
    openedApp: true,
    usedPdfAttachment: Boolean(pdfBlob || pdfDataUrl),
    message: `Downloaded ${descriptor.pdfFilename} & opened Messenger. Drag or attach the PDF in chat.`,
  };
}

/**
 * Legacy-compatible wrapper routed through `shareReceiptDocument` so PDF & recipient-free sharing work everywhere.
 */
export async function openMessengerAppWithReceipt(options: {
  textSummary?: string;
  pdfBlob?: Blob;
  pdfDataUrl?: string;
  pngDataUrl?: string;
  receiptNo?: string;
  tenantName?: string;
  roomName?: string;
  messengerHandle?: string;
  shareUrl?: string;
  autoDownloadPng?: boolean;
  preOpenedWindow?: Window | null;
}): Promise<{ openedApp: boolean; message: string }> {
  const res = await shareReceiptDocument({
    mode: 'messenger',
    textSummary: options.textSummary,
    pdfBlob: options.pdfBlob,
    pdfDataUrl: options.pdfDataUrl,
    pngDataUrl: options.pngDataUrl,
    receiptNo: options.receiptNo,
    tenantName: options.tenantName,
    roomName: options.roomName,
    messengerHandle: options.messengerHandle,
    shareUrl: options.shareUrl,
    preOpenedWindow: options.preOpenedWindow,
  });
  return {
    openedApp: res.openedApp,
    message: res.message,
  };
}
