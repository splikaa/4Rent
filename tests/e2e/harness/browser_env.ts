/**
 * 4Rent E2E Headless Browser Environment Harness
 *
 * Implements high-fidelity in-memory emulations of:
 * - Storage (localStorage & sessionStorage)
 * - IndexedDB (IDBFactory, IDBDatabase, IDBTransaction, IDBObjectStore, IDBRequest)
 * - BroadcastChannel (for 4rent_realtime_sync_channel cross-instance sync)
 * - Document, Window, Navigator, and Canvas/Image DOM elements
 */

// ============================================================================
// 1. In-Memory Storage Implementation (localStorage & sessionStorage)
// ============================================================================

export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  private quotaExceeded = false;

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return index >= 0 && index < keys.length ? keys[index] : null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: any): void {
    if (this.quotaExceeded) {
      const quotaErr = new Error('DOMException: QuotaExceededError - The quota has been exceeded.');
      (quotaErr as any).name = 'QuotaExceededError';
      (quotaErr as any).code = 22;
      throw quotaErr;
    }
    this.data.set(String(key), String(value));
  }

  /**
   * Test Harness Control: Simulate storage quota exhaustion
   */
  setQuotaExceeded(exceeded: boolean): void {
    this.quotaExceeded = exceeded;
  }

  /**
   * Diagnostic inspection of raw keys
   */
  dump(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.data.entries()) {
      out[k] = v;
    }
    return out;
  }
}

// ============================================================================
// 2. High-Fidelity In-Memory IndexedDB Implementation
// ============================================================================

class FakeIDBStore {
  private records = new Map<string, any>();

  put(val: any, key: string): void {
    this.records.set(key, structuredCloneSafe(val));
  }

  add(val: any, key: string): void {
    if (this.records.has(key)) {
      throw new Error(`Key already exists in store: ${key}`);
    }
    this.records.set(key, structuredCloneSafe(val));
  }

  get(key: string): any {
    const item = this.records.get(key);
    return item !== undefined ? structuredCloneSafe(item) : undefined;
  }

  getAll(): any[] {
    return Array.from(this.records.values()).map(structuredCloneSafe);
  }

  delete(key: string): void {
    this.records.delete(key);
  }

  clear(): void {
    this.records.clear();
  }

  count(): number {
    return this.records.size;
  }
}

export class FakeIDBRequest {
  result: any = undefined;
  error: Error | null = null;
  readyState: 'pending' | 'done' = 'pending';
  onsuccess: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onupgradeneeded: ((ev: any) => void) | null = null;

  triggerSuccess(result: any): void {
    this.result = result;
    this.readyState = 'done';
    if (this.onsuccess) {
      this.onsuccess({ target: this });
    }
  }

  triggerError(error: Error): void {
    this.error = error;
    this.readyState = 'done';
    if (this.onerror) {
      this.onerror({ target: this });
    }
  }
}

export class FakeIDBTransaction {
  db: any;
  mode: 'readonly' | 'readwrite';
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onabort: (() => void) | null = null;

  private storeMap: Map<string, FakeIDBStore>;
  private pendingRequests = 0;
  private isAborted = false;

  constructor(db: any, storeMap: Map<string, FakeIDBStore>, mode: 'readonly' | 'readwrite') {
    this.db = db;
    this.storeMap = storeMap;
    this.mode = mode;

    // Auto-complete transaction after microtasks
    queueMicrotask(() => this.checkCompletion());
  }

  objectStore(name: string): any {
    if (this.isAborted) {
      throw new Error('Transaction has been aborted');
    }
    const store = this.storeMap.get(name) || new FakeIDBStore();
    this.storeMap.set(name, store);

    return {
      put: (val: any, key: string) => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            store.put(val, key);
            req.triggerSuccess(key);
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
      add: (val: any, key: string) => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            store.add(val, key);
            req.triggerSuccess(key);
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
      get: (key: string) => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            const res = store.get(key);
            req.triggerSuccess(res);
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
      getAll: () => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            req.triggerSuccess(store.getAll());
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
      delete: (key: string) => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            store.delete(key);
            req.triggerSuccess(undefined);
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
      clear: () => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            store.clear();
            req.triggerSuccess(undefined);
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
      count: () => {
        const req = new FakeIDBRequest();
        this.pendingRequests++;
        queueMicrotask(() => {
          try {
            req.triggerSuccess(store.count());
          } catch (err: any) {
            req.triggerError(err);
          } finally {
            this.pendingRequests--;
            this.checkCompletion();
          }
        });
        return req;
      },
    };
  }

  abort(): void {
    this.isAborted = true;
    if (this.onabort) this.onabort();
  }

  private checkCompletion(): void {
    if (this.pendingRequests === 0 && !this.isAborted) {
      if (this.oncomplete) {
        this.oncomplete();
      }
    }
  }
}

// Global persistent IDB database registry (survives db.close())
const persistentIdbDatabases = new Map<string, { version: number; stores: Map<string, FakeIDBStore> }>();

export const fakeIndexedDB = {
  open(dbName: string, version: number = 1): FakeIDBRequest {
    const req = new FakeIDBRequest();

    queueMicrotask(() => {
      let isUpgradeNeeded = false;
      if (!persistentIdbDatabases.has(dbName)) {
        persistentIdbDatabases.set(dbName, {
          version,
          stores: new Map(),
        });
        isUpgradeNeeded = true;
      }

      const dbRecord = persistentIdbDatabases.get(dbName)!;
      if (dbRecord.version < version) {
        dbRecord.version = version;
        isUpgradeNeeded = true;
      }

      const fakeDb = {
        name: dbName,
        version: dbRecord.version,
        objectStoreNames: {
          contains: (name: string) => dbRecord.stores.has(name),
          item: (index: number) => Array.from(dbRecord.stores.keys())[index],
          get length() {
            return dbRecord.stores.size;
          },
        },
        createObjectStore: (name: string) => {
          if (!dbRecord.stores.has(name)) {
            dbRecord.stores.set(name, new FakeIDBStore());
          }
          return fakeDb.transaction(name, 'readwrite').objectStore(name);
        },
        deleteObjectStore: (name: string) => {
          dbRecord.stores.delete(name);
        },
        transaction: (storeNames: string | string[], mode: 'readonly' | 'readwrite' = 'readonly') => {
          return new FakeIDBTransaction(fakeDb, dbRecord.stores, mode);
        },
        close: () => {
          // Closed connection, persistent storage remains in memory
        },
      };

      if (isUpgradeNeeded && req.onupgradeneeded) {
        req.result = fakeDb;
        req.onupgradeneeded({ target: req, oldVersion: 0, newVersion: version });
      }

      req.triggerSuccess(fakeDb);
    });

    return req;
  },

  deleteDatabase(dbName: string): FakeIDBRequest {
    const req = new FakeIDBRequest();
    queueMicrotask(() => {
      persistentIdbDatabases.delete(dbName);
      req.triggerSuccess(undefined);
    });
    return req;
  },
};

// ============================================================================
// 3. BroadcastChannel Emulation (for 4rent_realtime_sync_channel)
// ============================================================================

const broadcastChannelRegistries = new Map<string, Set<FakeBroadcastChannel>>();

export class FakeBroadcastChannel {
  readonly name: string;
  onmessage: ((ev: { data: any }) => void) | null = null;
  private listeners = new Set<(ev: { data: any }) => void>();
  private isClosed = false;

  constructor(name: string) {
    this.name = name;
    if (!broadcastChannelRegistries.has(name)) {
      broadcastChannelRegistries.set(name, new Set());
    }
    broadcastChannelRegistries.get(name)!.add(this);
  }

  postMessage(message: any): void {
    if (this.isClosed) {
      throw new Error(`Cannot postMessage on closed BroadcastChannel '${this.name}'`);
    }

    const peers = broadcastChannelRegistries.get(this.name);
    if (!peers) return;

    const cloned = structuredCloneSafe(message);
    const event = { data: cloned };

    for (const channel of peers) {
      if (channel !== this && !channel.isClosed) {
        if (channel.onmessage) {
          channel.onmessage(event);
        }
        for (const listener of channel.listeners) {
          listener(event);
        }
      }
    }
  }

  addEventListener(type: string, listener: (ev: { data: any }) => void): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: (ev: { data: any }) => void): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  close(): void {
    this.isClosed = true;
    broadcastChannelRegistries.get(this.name)?.delete(this);
  }
}

// ============================================================================
// 4. In-Memory Canvas & Image DOM Emulation
// ============================================================================

export class FakeCanvasRenderingContext2D {
  canvas: FakeCanvasElement;

  constructor(canvas: FakeCanvasElement) {
    this.canvas = canvas;
  }

  drawImage(image: any, sxOrDx: number = 0, syOrDy: number = 0, swOrDw?: number, shOrDh?: number): void {
    const targetW = swOrDw !== undefined ? swOrDw : this.canvas.width;
    const targetH = shOrDh !== undefined ? shOrDh : this.canvas.height;

    // Transfer pixel buffer if source provides image data
    if (image && image._pixelData) {
      const srcPixels: Uint8ClampedArray = image._pixelData;
      const destPixels = this.canvas._pixelBuffer;
      const copyLen = Math.min(srcPixels.length, destPixels.length);
      for (let i = 0; i < copyLen; i++) {
        destPixels[i] = srcPixels[i];
      }
    } else if (image && image._pixelBuffer) {
      const srcPixels: Uint8ClampedArray = image._pixelBuffer;
      const destPixels = this.canvas._pixelBuffer;
      const copyLen = Math.min(srcPixels.length, destPixels.length);
      for (let i = 0; i < copyLen; i++) {
        destPixels[i] = srcPixels[i];
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray; width: number; height: number } {
    const out = new Uint8ClampedArray(sw * sh * 4);
    const buf = this.canvas._pixelBuffer;
    const cWidth = this.canvas.width;
    const cHeight = this.canvas.height;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcX = Math.min(cWidth - 1, Math.max(0, sx + x));
        const srcY = Math.min(cHeight - 1, Math.max(0, sy + y));
        const srcIdx = (srcY * cWidth + srcX) * 4;
        const outIdx = (y * sw + x) * 4;

        out[outIdx] = buf[srcIdx] || 0;
        out[outIdx + 1] = buf[srcIdx + 1] || 0;
        out[outIdx + 2] = buf[srcIdx + 2] || 0;
        out[outIdx + 3] = buf[srcIdx + 3] || 255;
      }
    }

    return { data: out, width: sw, height: sh };
  }

  putImageData(imageData: { data: Uint8ClampedArray; width: number; height: number }, dx: number, dy: number): void {
    const buf = this.canvas._pixelBuffer;
    const cWidth = this.canvas.width;
    const src = imageData.data;
    const sw = imageData.width;
    const sh = imageData.height;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const destX = dx + x;
        const destY = dy + y;
        if (destX >= 0 && destX < cWidth && destY >= 0 && destY < this.canvas.height) {
          const destIdx = (destY * cWidth + destX) * 4;
          const srcIdx = (y * sw + x) * 4;
          buf[destIdx] = src[srcIdx];
          buf[destIdx + 1] = src[srcIdx + 1];
          buf[destIdx + 2] = src[srcIdx + 2];
          buf[destIdx + 3] = src[srcIdx + 3];
        }
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {}
  clearRect(x: number, y: number, w: number, h: number): void {}
  beginPath(): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void {}
  moveTo(x: number, y: number): void {}
  lineTo(x: number, y: number): void {}
  rect(x: number, y: number, w: number, h: number): void {}
  arc(): void {}
  measureText(text: string) {
    return { width: text.length * 8 };
  }
}

export class FakeCanvasElement {
  private _width = 640;
  private _height = 640;
  _pixelBuffer = new Uint8ClampedArray(640 * 640 * 4);
  private context: FakeCanvasRenderingContext2D | null = null;

  get width(): number {
    return this._width;
  }
  set width(val: number) {
    this._width = Math.max(1, Math.floor(val));
    this.realloc();
  }

  get height(): number {
    return this._height;
  }
  set height(val: number) {
    this._height = Math.max(1, Math.floor(val));
    this.realloc();
  }

  getContext(type: string): FakeCanvasRenderingContext2D | null {
    if (type === '2d') {
      if (!this.context) {
        this.context = new FakeCanvasRenderingContext2D(this);
      }
      return this.context;
    }
    return null;
  }

  toDataURL(type: string = 'image/png'): string {
    return `data:${type};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
  }

  private realloc(): void {
    const old = this._pixelBuffer;
    this._pixelBuffer = new Uint8ClampedArray(this._width * this._height * 4);
    const copyLen = Math.min(old.length, this._pixelBuffer.length);
    for (let i = 0; i < copyLen; i++) {
      this._pixelBuffer[i] = old[i];
    }
  }
}

export class FakeImageElement {
  private _src = '';
  width = 640;
  height = 640;
  naturalWidth = 640;
  naturalHeight = 640;
  onload: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  _pixelData: Uint8ClampedArray | null = null;

  get src(): string {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }
}

export class FakeDOMElement {
  tagName: string;
  id = '';
  className = '';
  innerHTML = '';
  textContent = '';
  href = '';
  download = '';
  target = '';
  style: Record<string, string> = {};
  classList = {
    contains: (cls: string) => this.className.split(/\s+/).includes(cls),
    add: (cls: string) => {
      if (!this.classList.contains(cls)) {
        this.className = `${this.className} ${cls}`.trim();
      }
    },
    remove: (cls: string) => {
      this.className = this.className
        .split(/\s+/)
        .filter((c) => c !== cls)
        .join(' ');
    },
  };

  private attributes = new Map<string, string>();
  private children: FakeDOMElement[] = [];

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    if (name === 'href') this.href = value;
    if (name === 'download') this.download = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  appendChild(child: FakeDOMElement): FakeDOMElement {
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeDOMElement): FakeDOMElement {
    this.children = this.children.filter((c) => c !== child);
    return child;
  }

  click(): void {}
}

export class FakeDocument {
  body = new FakeDOMElement('BODY');
  head = new FakeDOMElement('HEAD');
  documentElement = new FakeDOMElement('HTML');

  createElement(tagName: string): any {
    const lower = tagName.toLowerCase();
    if (lower === 'canvas') {
      return new FakeCanvasElement();
    }
    if (lower === 'img' || lower === 'image') {
      return new FakeImageElement();
    }
    return new FakeDOMElement(tagName);
  }

  getElementById(id: string): FakeDOMElement | null {
    return null;
  }

  querySelector(selector: string): FakeDOMElement | null {
    return null;
  }

  querySelectorAll(selector: string): FakeDOMElement[] {
    return [];
  }
}

// ============================================================================
// 5. Global Setup & Teardown Utilities
// ============================================================================

function structuredCloneSafe<T>(obj: T): T {
  if (obj === undefined || obj === null) return obj;
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

let activeLocalStorage: MemoryStorage | null = null;
let activeSessionStorage: MemoryStorage | null = null;

export function setupBrowserEnv(): void {
  activeLocalStorage = new MemoryStorage();
  activeSessionStorage = new MemoryStorage();

  // Storage globals
  Object.defineProperty(globalThis, 'localStorage', {
    value: activeLocalStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: activeSessionStorage,
    configurable: true,
    writable: true,
  });

  // IndexedDB global
  Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeIndexedDB,
    configurable: true,
    writable: true,
  });

  // BroadcastChannel global
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: FakeBroadcastChannel,
    configurable: true,
    writable: true,
  });

  // Window global
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    configurable: true,
    writable: true,
  });

  // Navigator global (Node 21+ navigator is a getter, must redefine property)
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      onLine: true,
      language: 'en-US',
      languages: ['en-US', 'en'],
      hardwareConcurrency: 4,
    },
    configurable: true,
    writable: true,
  });

  // Document global
  Object.defineProperty(globalThis, 'document', {
    value: new FakeDocument(),
    configurable: true,
    writable: true,
  });

  // Image constructor global
  Object.defineProperty(globalThis, 'Image', {
    value: FakeImageElement,
    configurable: true,
    writable: true,
  });

  // HTMLCanvasElement & HTMLImageElement constructors for instanceof checks
  Object.defineProperty(globalThis, 'HTMLCanvasElement', {
    value: FakeCanvasElement,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'HTMLImageElement', {
    value: FakeImageElement,
    configurable: true,
    writable: true,
  });

  // Window event listener stubs
  const windowListeners = new Map<string, Set<Function>>();
  (globalThis as any).addEventListener = (type: string, fn: Function) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type)!.add(fn);
  };
  (globalThis as any).removeEventListener = (type: string, fn: Function) => {
    windowListeners.get(type)?.delete(fn);
  };
  (globalThis as any).dispatchEvent = (event: { type: string }) => {
    const set = windowListeners.get(event.type);
    if (set) {
      for (const fn of set) {
        fn(event);
      }
    }
    return true;
  };
}

export function resetBrowserEnv(): void {
  // Clear storages
  if (activeLocalStorage) activeLocalStorage.clear();
  if (activeSessionStorage) activeSessionStorage.clear();

  // Clear IDB stores
  for (const dbRecord of persistentIdbDatabases.values()) {
    for (const store of dbRecord.stores.values()) {
      store.clear();
    }
  }

  // Clear broadcast channels
  for (const set of broadcastChannelRegistries.values()) {
    set.clear();
  }
}

// Ensure browser env is initialized when harness is imported
setupBrowserEnv();
