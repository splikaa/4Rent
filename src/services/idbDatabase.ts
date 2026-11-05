import { AppDatabaseSnapshot } from '../types/rental';

const DB_NAME = 'FourRentPersistentDatabase';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const PRIMARY_KEY = 'master_snapshot';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
      store.put(snapshot, PRIMARY_KEY);
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

