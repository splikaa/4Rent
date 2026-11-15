import { useEffect, useState } from 'react';
import { getMeterMasterImage, peekCachedMeterImage } from '../services/idbDatabase';

export { peekCachedMeterImage };

/**
 * Resolves a stored meter photo reference (inline URL or 'idb:meter:...' key)
 * into a displayable data/blob/http URL.
 */
export async function resolveMeterImageSrc(
  ref?: string | null,
  fallbackRef?: string | null
): Promise<string> {
  const candidates = [ref, fallbackRef].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );

  for (const candidate of candidates) {
    const cached = peekCachedMeterImage(candidate);
    if (cached) return cached;

    if (candidate.startsWith('idb:meter:')) {
      const loaded = await getMeterMasterImage(candidate);
      if (loaded) return loaded;
    }
  }

  return '';
}

/**
 * React hook that asynchronously resolves an 'idb:meter:...' photo key (with an
 * optional fallback key) for immediate <img> rendering without storing raw base64
 * payloads in localStorage.
 */
export function useResolvedMeterImage(
  ref?: string | null,
  fallbackRef?: string | null
): string {
  const [resolved, setResolved] = useState<string>(() => {
    return (
      peekCachedMeterImage(ref) ||
      peekCachedMeterImage(fallbackRef) ||
      ''
    );
  });

  useEffect(() => {
    let active = true;
    const immediate =
      peekCachedMeterImage(ref) ||
      peekCachedMeterImage(fallbackRef) ||
      '';
    setResolved(immediate);

    if (immediate || (!ref && !fallbackRef)) {
      return () => {
        active = false;
      };
    }

    void resolveMeterImageSrc(ref, fallbackRef).then((src) => {
      if (active && src) {
        setResolved(src);
      }
    });

    return () => {
      active = false;
    };
  }, [ref, fallbackRef]);

  return resolved;
}
