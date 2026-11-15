const DEVICE_PROPERTY_CODE_KEY = '4rent_device_property_code';

let inMemoryFallbackCode: string | null = null;

/**
 * Normalizes a Property Space Code to uppercase URL/Firebase-safe characters.
 */
export function normalizePropertyCode(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Generates a unique, unambiguous random Property Space Code (e.g. "4R-7K2M9A").
 */
export function generatePropertyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let suffix = '';
  for (const b of bytes) {
    suffix += alphabet[b % alphabet.length];
  }
  return `4R-${suffix}`;
}

/**
 * Returns this device's persistently assigned random Property Space Code,
 * creating and storing one on first launch so fresh installs never share a hardcoded default.
 */
export function getOrCreateDevicePropertyCode(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = normalizePropertyCode(
        localStorage.getItem(DEVICE_PROPERTY_CODE_KEY) || ''
      );
      if (existing && existing !== '4RENT-MAIN') {
        inMemoryFallbackCode = existing;
        return existing;
      }
      const generated = generatePropertyCode();
      localStorage.setItem(DEVICE_PROPERTY_CODE_KEY, generated);
      inMemoryFallbackCode = generated;
      return generated;
    }
  } catch {
    // Fallback to in-memory code when localStorage is unavailable or full
  }

  if (!inMemoryFallbackCode) {
    inMemoryFallbackCode = generatePropertyCode();
  }
  return inMemoryFallbackCode;
}

/**
 * Resolves a configured Property Space Code, falling back to this device's unique
 * randomly generated code rather than a shared static constant.
 */
export function resolveConfiguredPropertyCode(raw?: string): string {
  const normalized = normalizePropertyCode(raw || '');
  return normalized || getOrCreateDevicePropertyCode();
}
