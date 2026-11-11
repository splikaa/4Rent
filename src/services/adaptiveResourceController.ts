/**
 * 4Rent Adaptive Resource & Progression Controller (OmniRoute Inspired)
 *
 * Monitors client device conditions (battery, cellular data saver, memory, connectivity)
 * and automatically adjusts system usage mode between High Performance, Balanced, and Eco/Low-Resource.
 * Ensures system progression never stalls even on low resources, dead zones, or low battery.
 */

export type SystemUsageTier = 'performance' | 'balanced' | 'eco_low_resource';

export interface DeviceTelemetry {
  tier: SystemUsageTier;
  isOnline: boolean;
  isLowBattery: boolean;
  batteryLevelPct: number | null;
  isDataSaver: boolean;
  effectiveNetworkType: string;
  deviceMemoryGb: number | null;
  recommendedCameraMode: 'video' | 'snapshot';
  syncIntervalMs: number;
}

type TelemetryListener = (telemetry: DeviceTelemetry) => void;

class AdaptiveResourceController {
  private static instance: AdaptiveResourceController;
  private listeners: Set<TelemetryListener> = new Set();

  private currentTelemetry: DeviceTelemetry = {
    tier: 'performance',
    isOnline: true,
    isLowBattery: false,
    batteryLevelPct: null,
    isDataSaver: false,
    effectiveNetworkType: '4g',
    deviceMemoryGb: null,
    recommendedCameraMode: 'video',
    syncIntervalMs: 5000,
  };

  private constructor() {
    this.initTelemetryListeners();
    this.evaluateUsageTier();
  }

  public static getInstance(): AdaptiveResourceController {
    if (!AdaptiveResourceController.instance) {
      AdaptiveResourceController.instance = new AdaptiveResourceController();
    }
    return AdaptiveResourceController.instance;
  }

  public getTelemetry(): DeviceTelemetry {
    return { ...this.currentTelemetry };
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.getTelemetry());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const telemetry = this.getTelemetry();
    for (const listener of this.listeners) {
      try {
        listener(telemetry);
      } catch (err) {
        console.warn('Telemetry listener error:', err);
      }
    }
  }

  private async initTelemetryListeners() {
    if (typeof window === 'undefined') return;

    // 1. Online / Offline events
    window.addEventListener('online', () => this.evaluateUsageTier());
    window.addEventListener('offline', () => this.evaluateUsageTier());

    // 2. Network connection change
    const nav = navigator as any;
    const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    if (connection) {
      connection.addEventListener?.('change', () => this.evaluateUsageTier());
    }

    // 3. Battery status API
    if (typeof nav?.getBattery === 'function') {
      try {
        const battery = await nav.getBattery();
        const updateBattery = () => {
          const level = Math.round((battery.level || 1) * 100);
          const isDischargingLow = !battery.charging && level <= 20;
          this.currentTelemetry.batteryLevelPct = level;
          this.currentTelemetry.isLowBattery = isDischargingLow;
          this.evaluateUsageTier();
        };

        battery.addEventListener?.('levelchange', updateBattery);
        battery.addEventListener?.('chargingchange', updateBattery);
        updateBattery();
      } catch {
        // Battery API blocked or unavailable
      }
    }
  }

  public evaluateUsageTier(): SystemUsageTier {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;

    const isDataSaver = Boolean(conn?.saveData);
    const effectiveType = String(conn?.effectiveType || '4g').toLowerCase();
    const deviceMemory = typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null;

    let isLowResource = false;
    let isModerateResource = false;

    // Decision rule 1: Offline or poor cellular (2G, slow 3G)
    if (!isOnline || ['slow-2g', '2g', '3g'].includes(effectiveType) || isDataSaver) {
      isLowResource = true;
    }

    // Decision rule 2: Low battery (< 20% on discharge)
    if (this.currentTelemetry.isLowBattery) {
      isLowResource = true;
    }

    // Decision rule 3: Low hardware memory (<= 2GB)
    if (deviceMemory !== null && deviceMemory <= 2) {
      isModerateResource = true;
    }

    const tier: SystemUsageTier = isLowResource
      ? 'eco_low_resource'
      : isModerateResource
        ? 'balanced'
        : 'performance';

    this.currentTelemetry = {
      ...this.currentTelemetry,
      tier,
      isOnline,
      isDataSaver,
      effectiveNetworkType: effectiveType,
      deviceMemoryGb: deviceMemory,
      recommendedCameraMode: tier === 'eco_low_resource' ? 'snapshot' : 'video',
      syncIntervalMs: tier === 'eco_low_resource' ? 15000 : tier === 'balanced' ? 8000 : 4000,
    };

    this.notify();
    return tier;
  }
}

export const adaptiveController = AdaptiveResourceController.getInstance();
