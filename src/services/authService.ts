/**
 * Device Biometric Authentication Service (Native Android BiometricPrompt & WebAuthn).
 * Fails closed on unavailable, cancelled, or error states so callers fall back to PIN verification.
 */

interface AndroidBiometricWindow {
  AndroidBiometrics?: {
    isSupported?: () => boolean;
    authenticate: (title: string, subtitle: string) => void;
  };
  __onAndroidBiometricResult?: (ok: boolean, msg: string) => void;
}

function getNativeAndroidBridge(): AndroidBiometricWindow['AndroidBiometrics'] | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as AndroidBiometricWindow;
  const androidBio = win.AndroidBiometrics;
  if (
    !androidBio ||
    typeof androidBio.authenticate !== 'function' ||
    (typeof androidBio.isSupported === 'function' && !androidBio.isSupported())
  ) {
    return null;
  }
  return androidBio;
}

/**
 * Returns true if the current environment has native Android biometrics or a registered passkey.
 */
export function hasBiometricEnrollment(credentialId?: string): boolean {
  return Boolean(getNativeAndroidBridge()) || Boolean(credentialId);
}

function runAndroidBiometricPrompt(
  title: string,
  subtitle: string,
  messages: { timeout: string; cancel: string; error: string },
  vibratePattern: number | number[]
): Promise<{ ok: boolean; message: string } | null> {
  const win = window as unknown as AndroidBiometricWindow;
  const androidBio = getNativeAndroidBridge();
  if (!androidBio) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: { ok: boolean; message: string }) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      delete win.__onAndroidBiometricResult;
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({ ok: false, message: messages.timeout });
    }, 20000);

    win.__onAndroidBiometricResult = (ok: boolean, msg: string) => {
      if (ok) {
        try {
          navigator.vibrate?.(vibratePattern);
        } catch {
          // ignore
        }
        finish({ ok: true, message: 'Verified.' });
      } else {
        finish({ ok: false, message: msg || messages.cancel });
      }
    };

    try {
      androidBio.authenticate(title, subtitle);
    } catch {
      finish({ ok: false, message: messages.error });
    }
  });
}

export async function registerDeviceBiometrics(): Promise<{
  ok: boolean;
  credentialId?: string;
  message: string;
}> {
  const androidRes = await runAndroidBiometricPrompt(
    '4Rent Biometric Security',
    'Touch fingerprint sensor to register Landlord access',
    {
      timeout: 'Biometric enrollment timed out. Please try again or create a 4-Digit PIN.',
      cancel: 'Fingerprint enrollment cancelled.',
      error: 'Could not start biometric enrollment. Please use a 4-Digit PIN.',
    },
    [35, 45, 60]
  );
  if (androidRes) {
    return androidRes.ok
      ? {
          ok: true,
          credentialId: `android-bio-${Date.now()}`,
          message: 'Device Fingerprint registered!',
        }
      : { ok: false, message: androidRes.message };
  }

  try {
    if (window.PublicKeyCredential && navigator.credentials) {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: '4Rent Management System',
            id: window.location.hostname || 'localhost',
          },
          user: {
            id: userId,
            name: 'admin@4rent.local',
            displayName: '4Rent Landlord',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 45000,
        },
      })) as PublicKeyCredential | null;

      if (credential) {
        const credBytes = new Uint8Array(credential.rawId);
        let binary = '';
        credBytes.forEach((b) => (binary += String.fromCharCode(b)));
        const credentialId = btoa(binary);
        try {
          navigator.vibrate?.([35, 45, 60]);
        } catch {
          // ignore
        }
        return {
          ok: true,
          credentialId,
          message: 'Device fingerprint registered!',
        };
      }
    }
  } catch {
    return {
      ok: false,
      message: 'Biometric registration was cancelled or is unsupported on this browser.',
    };
  }

  return {
    ok: false,
    message: 'Biometric authentication is not available on this device. Please create a 4-Digit PIN.',
  };
}

export async function isDeviceBiometricsAvailable(): Promise<{
  supported: boolean;
  nativeAndroid: boolean;
  reason?: string;
}> {
  if (typeof window === 'undefined') {
    return { supported: false, nativeAndroid: false, reason: 'Unavailable in this runtime.' };
  }
  if (getNativeAndroidBridge()) {
    return { supported: true, nativeAndroid: true };
  }
  if (window.location.protocol === 'file:') {
    return {
      supported: false,
      nativeAndroid: false,
      reason: 'Desktop file:// mode does not expose WebAuthn Biometrics; use localhost/web or your 4-digit PIN.',
    };
  }
  try {
    if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      const ok = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return {
        supported: ok,
        nativeAndroid: false,
        reason: ok ? undefined : 'No built-in platform biometric authenticator detected on this device.',
      };
    }
  } catch {
    // ignore probe errors
  }
  return {
    supported: false,
    nativeAndroid: false,
    reason: 'WebAuthn biometrics is not supported in this browser.',
  };
}

export async function verifyDeviceBiometrics(
  credentialIdBase64?: string
): Promise<{ ok: boolean; notConfigured?: boolean; message: string }> {
  const androidRes = await runAndroidBiometricPrompt(
    'Unlock 4Rent',
    'Scan fingerprint to unlock',
    {
      timeout: 'Fingerprint scan timed out. Tap to try again or enter your 4-digit PIN.',
      cancel: 'Fingerprint not recognized. Try again or use PIN.',
      error: 'Biometric prompt failed. Please enter your 4-digit PIN.',
    },
    45
  );
  if (androidRes) {
    return androidRes.ok
      ? { ok: true, message: 'Fingerprint verified.' }
      : androidRes;
  }

  if (
    !credentialIdBase64 ||
    credentialIdBase64.startsWith('mobile-fingerprint-') ||
    credentialIdBase64.startsWith('android-bio-') ||
    credentialIdBase64 === 'simulated-biometric-id'
  ) {
    return {
      ok: false,
      notConfigured: true,
      message: 'Biometrics is not set up on this device yet. Set up Biometrics in Settings or enter your 4-digit PIN.',
    };
  }

  try {
    if (window.PublicKeyCredential && navigator.credentials) {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const bin = atob(credentialIdBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: bytes }],
          userVerification: 'required',
          timeout: 45000,
        },
      });

      if (assertion) {
        return { ok: true, message: 'Biometric verification succeeded.' };
      }
    }
  } catch {
    return {
      ok: false,
      message: 'Biometric verification cancelled or failed. Please enter your 4-digit PIN.',
    };
  }

  return {
    ok: false,
    message: 'Biometric verification unavailable. Please enter your 4-digit PIN.',
  };
}
