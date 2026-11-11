import { AppDatabaseSnapshot } from '../types/rental';

const DB_NAME = 'FourRentPersistentDatabase';
const DB_VERSION = 2;
const STORE_NAME = 'app_state';
const PRIMARY_KEY = 'master_snapshot';
export const METER_IMAGES_STORE = 'meter_images';

// In-memory fallback for environments where IndexedDB is blocked or unavailable
const memoryMasterImageStore = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(METER_IMAGES_STORE)) {
        db.createObjectStore(METER_IMAGES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Saves a full-resolution master meter photo into the dedicated IndexedDB `meter_images` store.
 * Eliminates localStorage QuotaExceededError by offloading high-resolution master captures.
 * Returns the persistent meterKey reference string (e.g., 'idb:meter:room1-curr-1718000000').
 */
export async function saveMeterMasterImage(
  readingId: string,
  imageBlobOrDataUrl: string
): Promise<string> {
  if (!imageBlobOrDataUrl) return '';

  const cleanId = readingId.trim() || `meter_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const meterKey = cleanId.startsWith('idb:meter:') ? cleanId : `idb:meter:${cleanId}`;

  // Always keep in memory fallback
  memoryMasterImageStore.set(meterKey, imageBlobOrDataUrl);

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(METER_IMAGES_STORE, 'readwrite');
      const store = tx.objectStore(METER_IMAGES_STORE);
      const req = store.put(imageBlobOrDataUrl, meterKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[4Rent IDB] Master image storage fallback active for key:', meterKey, err);
  }

  return meterKey;
}

/**
 * Retrieves the full-resolution master meter image from IndexedDB.
 * Supports direct data URLs, blob URLs, and persistent 'idb:meter:...' keys.
 */
export async function getMeterMasterImage(meterKey: string): Promise<string | null> {
  if (!meterKey) return null;

  // If the key is already a raw data URL or http/blob URL, return it immediately
  if (
    meterKey.startsWith('data:') ||
    meterKey.startsWith('blob:') ||
    meterKey.startsWith('http://') ||
    meterKey.startsWith('https://')
  ) {
    return meterKey;
  }

  // Check in-memory fallback first
  if (memoryMasterImageStore.has(meterKey)) {
    return memoryMasterImageStore.get(meterKey) || null;
  }

  try {
    const db = await openDb();
    const result = await new Promise<string | Blob | null>((resolve, reject) => {
      const tx = db.transaction(METER_IMAGES_STORE, 'readonly');
      const store = tx.objectStore(METER_IMAGES_STORE);
      const req = store.get(meterKey);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          // Try without or with 'idb:meter:' prefix if mismatch
          const altKey = meterKey.startsWith('idb:meter:')
            ? meterKey.replace('idb:meter:', '')
            : `idb:meter:${meterKey}`;
          const altReq = store.get(altKey);
          altReq.onsuccess = () => resolve(altReq.result || null);
          altReq.onerror = () => resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    if (!result) return null;

    if (typeof result === 'string') {
      memoryMasterImageStore.set(meterKey, result);
      return result;
    }

    if (result instanceof Blob) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          memoryMasterImageStore.set(meterKey, res);
          resolve(res);
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(result);
      });
    }

    return null;
  } catch (err) {
    console.warn('[4Rent IDB] Could not load master meter image for key:', meterKey, err);
    return memoryMasterImageStore.get(meterKey) || null;
  }
}

/**
 * Removes a master meter photo from the persistent store when deleting a room or bill.
 */
export async function deleteMeterMasterImage(meterKey: string): Promise<void> {
  if (!meterKey) return;
  memoryMasterImageStore.delete(meterKey);

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(METER_IMAGES_STORE, 'readwrite');
      const store = tx.objectStore(METER_IMAGES_STORE);
      const req = store.delete(meterKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore deletion errors
  }
}

/**
 * Saves the complete database snapshot into persistent IndexedDB so app updates
 * never clear or alter the landlord's stored rooms, readings, or payment history.
 */
export async function saveSnapshotToIndexedDb(
  snapshot: AppDatabaseSnapshot
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(PRIMARY_KEY);
      getReq.onsuccess = () => {
        const existing: AppDatabaseSnapshot | undefined = getReq.result;
        let toSave = snapshot;
        if (existing) {
          // Preserve offloaded photo assets from existing IndexedDB snapshot
          const mergedRooms = snapshot.rooms?.map((r) => {
            if (r.lastMeterPhotoDataUrl === '[idb-offloaded:photo]') {
              const existingRoom = existing.rooms?.find((er) => er.id === r.id);
              if (
                existingRoom?.lastMeterPhotoDataUrl &&
                existingRoom.lastMeterPhotoDataUrl !== '[idb-offloaded:photo]'
              ) {
                return {
                  ...r,
                  lastMeterPhotoDataUrl: existingRoom.lastMeterPhotoDataUrl,
                };
              }
            }
            return r;
          });
          const mergedBills = snapshot.bills?.map((b) => {
            let updated = { ...b };
            const existingBill = existing.bills?.find((eb) => eb.id === b.id);
            if (
              b.prevMeterPhotoDataUrl === '[idb-offloaded:photo]' &&
              existingBill?.prevMeterPhotoDataUrl
            ) {
              updated.prevMeterPhotoDataUrl = existingBill.prevMeterPhotoDataUrl;
            }
            if (
              b.meterPhotoDataUrl === '[idb-offloaded:photo]' &&
              existingBill?.meterPhotoDataUrl
            ) {
              updated.meterPhotoDataUrl = existingBill.meterPhotoDataUrl;
            }
            return updated;
          });
          toSave = {
            ...snapshot,
            rooms: mergedRooms || snapshot.rooms,
            bills: mergedBills || snapshot.bills,
          };
        }
        store.put(toSave, PRIMARY_KEY);
      };
      getReq.onerror = () => {
        store.put(snapshot, PRIMARY_KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback to localStorage already handled by storageService
  }
}

/**
 * Loads the persistent database snapshot from IndexedDB if available.
 */
export async function loadSnapshotFromIndexedDb(): Promise<AppDatabaseSnapshot | null> {
  try {
    const db = await openDb();
    const result = await new Promise<AppDatabaseSnapshot | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(PRIMARY_KEY);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
      }
    );
    db.close();
    return result;
  } catch {
    return null;
  }
}

/**
 * Completely clears the stored persistent database snapshot from IndexedDB.
 */
export async function clearSnapshotFromIndexedDb(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(PRIMARY_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // Ignore IndexedDB delete error
  }
}

