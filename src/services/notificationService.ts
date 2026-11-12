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
          'Day 1–10 billing & due-date alerts are active on this device.'
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
          message: 'Could not verify notification permission on Android.',
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
                body: 'Day 1–10 billing & due-date reminders are active.',
                icon: './4rent-logo.svg',
              });
            } else {
              new Notification('4Rent Notifications Verified ✓', {
                body: 'Day 1–10 billing & due-date reminders are active.',
                icon: './4rent-logo.svg',
              });
            }
          } else {
            new Notification('4Rent Notifications Verified ✓', {
              body: 'Day 1–10 billing & due-date reminders are active.',
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

/**
 * Opens the native Messenger application / System Share sheet on Mobile (Android APK / iOS / Android Web)
 * and Desktop using Meta App ID 1127838943497464 and Web Share API.
 */
export async function openMessengerAppWithReceipt(options: {
  textSummary?: string;
  pngDataUrl?: string;
  receiptNo?: string;
  tenantName?: string;
  roomName?: string;
  messengerHandle?: string;
  shareUrl?: string;
  autoDownloadPng?: boolean;
  preOpenedWindow?: Window | null;
}): Promise<{ openedApp: boolean; message: string }> {
  const {
    textSummary,
    pngDataUrl,
    receiptNo = 'Receipt',
    tenantName,
    roomName,
    messengerHandle,
    shareUrl,
    autoDownloadPng = true,
    preOpenedWindow,
  } = options;

  const cleanHandle = (messengerHandle || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?(m\.me|messenger\.com\/t|facebook\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');

  const safeTenant = (tenantName || 'Tenant')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeRoom = (roomName || 'Room')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const customFileName = `Receipt_${safeTenant}_${safeRoom}_${receiptNo}.png`;

  const fallbackUrl =
    typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : 'https://splikaa.github.io/4Rent/';
  const finalShareUrl = shareUrl || fallbackUrl;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = isAndroid || isIOS;

  let imageBlob: Blob | null = null;
  let copiedImageToClipboard = false;
  if (pngDataUrl) {
    try {
      const res = await fetch(pngDataUrl);
      imageBlob = await res.blob();
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': imageBlob }),
        ]);
        copiedImageToClipboard = true;
      }
    } catch {
      // ignore clipboard error
    }
  } else if (textSummary && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(textSummary);
    } catch {
      // ignore clipboard error
    }
  }

  const win = window as unknown as {
    AndroidNative?: {
      shareToMessenger?: (
        pngBase64: string,
        summaryText: string,
        handle: string
      ) => boolean;
      openMessengerApp?: (handle: string, summaryText: string) => boolean;
    };
  };

  if (win.AndroidNative && typeof win.AndroidNative.shareToMessenger === 'function') {
    try {
      const launched = win.AndroidNative.shareToMessenger(
        pngDataUrl || '',
        '',
        cleanHandle
      );
      if (launched) {
        return {
          openedApp: true,
          message: 'Opened native share drawer with receipt image ready to send!',
        };
      }
    } catch {
      // fall through
    }
  }

  if (isMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    if (imageBlob) {
      try {
        const receiptFile = new File([imageBlob], customFileName, {
          type: 'image/png',
        });
        if (
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [receiptFile] })
        ) {
          await navigator.share({
            files: [receiptFile],
            title: `4Rent Receipt #${receiptNo} - ${safeRoom}`,
          });
          return {
            openedApp: true,
            message: 'Receipt image shared! Select Messenger to forward.',
          };
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          return {
            openedApp: false,
            message: 'Share dismissed.',
          };
        }
      }
    }
  }

  if (isMobile) {
    const openExternalTarget = (targetUrl: string) => {
      const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const a = document.createElement('a');
        a.href = targetUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      }
    };

    let mobileClipboardHint = 'Details copied! ';
    if (copiedImageToClipboard) {
      mobileClipboardHint = 'Receipt image copied! ';
    } else if (pngDataUrl) {
      mobileClipboardHint = '';
    }

    if (cleanHandle) {
      openExternalTarget(`https://m.me/${encodeURIComponent(cleanHandle)}`);
      return {
        openedApp: true,
        message: `${mobileClipboardHint}Opening Messenger chat with @${cleanHandle}...`,
      };
    }

    const appId = META_MESSENGER_APP_ID;
    const messengerMobileUri = `fb-messenger://share/?link=${encodeURIComponent(
      finalShareUrl
    )}&app_id=${appId}`;

    if (isAndroid) {
      const intentUri = `intent://share/?link=${encodeURIComponent(
        finalShareUrl
      )}&app_id=${appId}#Intent;scheme=fb-messenger;package=com.facebook.orca;S.browser_fallback_url=${encodeURIComponent(
        'https://m.me'
      )};end`;
      try {
        openExternalTarget(intentUri);
      } catch {
        openExternalTarget(messengerMobileUri);
      }
    } else {
      openExternalTarget(messengerMobileUri);
    }

    return {
      openedApp: true,
      message: `${mobileClipboardHint}Opening Messenger app...`,
    };
  }

  if (autoDownloadPng && pngDataUrl) {
    try {
      const a = document.createElement('a');
      a.href = pngDataUrl;
      a.download = customFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // ignore
    }
  }

  const desktopMessengerUrl = cleanHandle
    ? `https://m.me/${encodeURIComponent(cleanHandle)}`
    : 'https://www.messenger.com/';

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
    message: pngDataUrl
      ? copiedImageToClipboard
        ? 'Receipt image copied & PNG saved. Press Ctrl+V in Messenger to send.'
        : 'Receipt PNG saved & Messenger opened. Attach the downloaded PNG to send.'
      : 'Details copied! Press Ctrl+V in Messenger to send.',
  };
}
