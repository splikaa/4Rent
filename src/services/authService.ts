/**
 * Device Biometric Authentication Service (Native Android BiometricPrompt & WebAuthn).
 * Fails closed on unavailable, cancelled, or error states so callers fall back to PIN verification.
 */

export async function registerDeviceBiometrics(): Promise<{
  ok: boolean;
  credentialId?: string;
  message: string;
}> {
  const win = window as unknown as {
    AndroidBiometrics?: {
      isSupported?: () => boolean;
      authenticate: (title: string, subtitle: string) => void;
    };
    __onAndroidBiometricResult?: (ok: boolean, msg: string) => void;
  };

  const androidBio = win.AndroidBiometrics;
  if (
    androidBio &&
    typeof androidBio.authenticate === 'function' &&
    (typeof androidBio.isSupported !== 'function' || androidBio.isSupported())
  ) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({
            ok: false,
            message: 'Biometric enrollment timed out. Please try again or create a 4-Digit PIN.',
          });
        }
      }, 20000);

      win.__onAndroidBiometricResult = (ok: boolean, msg: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          try {
            navigator.vibrate?.([35, 45, 60]);
          } catch {
            // ignore
          }
          resolve({
            ok: true,
            credentialId: `android-bio-${Date.now()}`,
            message: 'Device Fingerprint registered!',
          });
        } else {
          resolve({
            ok: false,
            message: msg || 'Fingerprint enrollment cancelled.',
          });
        }
      };

      try {
        androidBio.authenticate(
          '4Rent Biometric Security',
          'Touch fingerprint sensor to register Landlord access'
        );
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            ok: false,
            message: 'Could not start biometric enrollment. Please use a 4-Digit PIN.',
          });
        }
      }
    });
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

export async function verifyDeviceBiometrics(
  credentialIdBase64?: string
): Promise<{ ok: boolean; message: string }> {
  const win = window as unknown as {
    AndroidBiometrics?: {
      isSupported?: () => boolean;
      authenticate: (title: string, subtitle: string) => void;
    };
    __onAndroidBiometricResult?: (ok: boolean, msg: string) => void;
  };

  const androidBio = win.AndroidBiometrics;
  if (
    androidBio &&
    typeof androidBio.authenticate === 'function' &&
    (typeof androidBio.isSupported !== 'function' || androidBio.isSupported())
  ) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({
            ok: false,
            message: 'Fingerprint scan timed out. Tap to try again or enter your 4-digit PIN.',
          });
        }
      }, 20000);

      win.__onAndroidBiometricResult = (ok: boolean, msg: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          try {
            navigator.vibrate?.(45);
          } catch {
            // ignore
          }
          resolve({ ok: true, message: 'Fingerprint verified.' });
        } else {
          resolve({
            ok: false,
            message: msg || 'Fingerprint not recognized. Try again or use PIN.',
          });
        }
      };

      try {
        androidBio.authenticate('Unlock 4Rent', 'Scan fingerprint to unlock');
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            ok: false,
            message: 'Biometric prompt failed. Please enter your 4-digit PIN.',
          });
        }
      }
    });
  }

  if (
    !credentialIdBase64 ||
    credentialIdBase64.startsWith('mobile-fingerprint-') ||
    credentialIdBase64.startsWith('android-bio-') ||
    credentialIdBase64 === 'simulated-biometric-id'
  ) {
    return {
      ok: false,
      message: 'Biometric sensor unavailable in this environment. Please enter your 4-digit PIN.',
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
