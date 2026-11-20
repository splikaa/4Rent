import { AppDatabaseSnapshot, AppSettings } from '../types/rental';
import { resolveConfiguredPropertyCode } from '../utils/propertyCode';
import {
  mergeDatabaseSnapshots,
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
} from './firebaseSync';
import {
  applyCloudSnapshotCleanly,
  clearPendingCloudApply,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  resetWorkspaceForPropertyCode,
  setStoredMobileAppliedMonth,
  updateStoredCloudSync,
} from './storageService';

export interface MobilePropertyLockState {
  isLockedThisMonth: boolean;
  activeLockedCode?: string;
  currentMonthKey: string;
}

export interface PropertySpaceSwitchDeps {
  pull: typeof pullSnapshotFromCloud;
  push: typeof pushSnapshotToCloud;
  exportSnapshot: typeof exportDatabaseSnapshot;
  importSnapshot: typeof importDatabaseSnapshot;
  mergeSnapshots: typeof mergeDatabaseSnapshots;
  applyClean: typeof applyCloudSnapshotCleanly;
  resetWorkspace: typeof resetWorkspaceForPropertyCode;
  clearPending: typeof clearPendingCloudApply;
  saveMobileMonth?: (monthKey: string) => void;
  updateCloudSync?: (cloudSync: AppSettings['cloudSync']) => void;
}

export interface PropertyCodeSyncParams {
  previousCode: string;
  targetCloudSync: AppSettings['cloudSync'];
  isOnline: boolean;
  networkLabel: string;
  isMobile?: boolean;
  mobileLock?: MobilePropertyLockState;
  deps?: Partial<PropertySpaceSwitchDeps>;
}

export interface PropertyCodeSyncResult {
  ok: boolean;
  mode: 'switched-existing' | 'switched-new' | 'merged-same-code' | 'blocked';
  message: string;
  appliedCloudSync: AppSettings['cloudSync'];
  requiresReload: boolean;
  dataChanged: boolean;
}

function defaultDeps(overrides?: Partial<PropertySpaceSwitchDeps>): PropertySpaceSwitchDeps {
  return {
    pull: pullSnapshotFromCloud,
    push: pushSnapshotToCloud,
    exportSnapshot: exportDatabaseSnapshot,
    importSnapshot: importDatabaseSnapshot,
    mergeSnapshots: mergeDatabaseSnapshots,
    applyClean: applyCloudSnapshotCleanly,
    resetWorkspace: resetWorkspaceForPropertyCode,
    clearPending: clearPendingCloudApply,
    saveMobileMonth: setStoredMobileAppliedMonth,
    updateCloudSync: updateStoredCloudSync,
    ...overrides,
  };
}

/**
 * Applies a Property Space Code and syncs with Firebase:
 * - Switching to an existing cloud code replaces local workspace cleanly with remote data.
 * - Switching to a new unused code resets local/dashboard records cleanly and initializes cloud.
 * - Staying on the same code merges local + remote changes and pushes.
 * - Offline or remote verification errors abort cleanly without wiping current data.
 */
export async function applyPropertyCodeAndSync(
  params: PropertyCodeSyncParams
): Promise<PropertyCodeSyncResult> {
  const d = defaultDeps(params.deps);
  const prevCode = resolveConfiguredPropertyCode(params.previousCode);
  const nextCode = resolveConfiguredPropertyCode(params.targetCloudSync?.propertyCode);
  const codeChanged = prevCode !== nextCode;

  const baseTargetCloudSync: AppSettings['cloudSync'] = {
    ...params.targetCloudSync,
    enabled: params.targetCloudSync?.enabled ?? true,
    provider: params.targetCloudSync?.provider || 'firebase',
    propertyCode: nextCode,
  };

  if (codeChanged && params.isMobile && params.mobileLock?.isLockedThisMonth) {
    const lockedCode = resolveConfiguredPropertyCode(
      params.mobileLock.activeLockedCode || prevCode
    );
    if (nextCode !== lockedCode) {
      return {
        ok: false,
        mode: 'blocked',
        message: `Mobile Property Code is locked to "${lockedCode}" for this month.`,
        appliedCloudSync: { ...baseTargetCloudSync, propertyCode: prevCode },
        requiresReload: false,
        dataChanged: false,
      };
    }
  }

  if (!params.isOnline) {
    return {
      ok: false,
      mode: 'blocked',
      message: codeChanged
        ? `Internet connection is required to verify and switch to "${nextCode}". Current data for "${prevCode}" was kept.`
        : 'Device is currently Offline. Local changes are saved in IndexedDB.',
      appliedCloudSync: codeChanged
        ? { ...baseTargetCloudSync, propertyCode: prevCode }
        : baseTargetCloudSync,
      requiresReload: false,
      dataChanged: false,
    };
  }

  const pullRes = await d.pull(baseTargetCloudSync);
  const localSnapBeforeSwitch = d.exportSnapshot();
  const hasLocalUnsyncedData =
    (localSnapBeforeSwitch.rooms && localSnapBeforeSwitch.rooms.length > 0) ||
    (localSnapBeforeSwitch.bills && localSnapBeforeSwitch.bills.length > 0);
  const shouldMergeLocalOnSwitch =
    Boolean(params.isMobile) && hasLocalUnsyncedData;

  if (codeChanged) {
    const mobileMonthPatch =
      params.isMobile && params.mobileLock?.currentMonthKey
        ? {
            mobileCodeAppliedMonth: params.mobileLock.currentMonthKey,
            mobileCodeAppliedAt: new Date().toISOString(),
          }
        : {};

    if (pullRes.ok && pullRes.snapshot) {
      const nextCloudSync: AppSettings['cloudSync'] = {
        ...baseTargetCloudSync,
        ...mobileMonthPatch,
        lastSyncedAt: pullRes.updatedAt || new Date().toISOString(),
      };
      if (shouldMergeLocalOnSwitch) {
        const mergedSnap = d.mergeSnapshots(localSnapBeforeSwitch, pullRes.snapshot);
        mergedSnap.settings = {
          ...mergedSnap.settings,
          cloudSync: nextCloudSync,
        };
        d.importSnapshot(mergedSnap, { preserveLocalSecurity: true });
        const pushMergedRes = await d.push(nextCloudSync, mergedSnap);
        const syncedCloud: AppSettings['cloudSync'] = pushMergedRes.ok
          ? { ...nextCloudSync, lastSyncedAt: pushMergedRes.syncedAt }
          : nextCloudSync;
        d.updateCloudSync?.(syncedCloud);
        d.clearPending();
        if (params.isMobile && params.mobileLock?.currentMonthKey) {
          d.saveMobileMonth?.(params.mobileLock.currentMonthKey);
        }
        return {
          ok: true,
          mode: 'switched-existing',
          message: `Connected to "${nextCode}". Merged and pushed offline Mobile rooms and configurations to cloud.`,
          appliedCloudSync: syncedCloud,
          requiresReload: true,
          dataChanged: true,
        };
      }
      await d.applyClean(pullRes.snapshot, nextCloudSync);
      if (params.isMobile && params.mobileLock?.currentMonthKey) {
        d.saveMobileMonth?.(params.mobileLock.currentMonthKey);
      }
      return {
        ok: true,
        mode: 'switched-existing',
        message: `Connected to "${nextCode}". Loaded existing cloud rooms, readings, and receipts.`,
        appliedCloudSync: nextCloudSync,
        requiresReload: true,
        dataChanged: true,
      };
    }

    if (pullRes.notFound) {
      const initialCloudSync: AppSettings['cloudSync'] = {
        ...baseTargetCloudSync,
        ...mobileMonthPatch,
        lastSyncedAt: undefined,
      };
      if (!shouldMergeLocalOnSwitch) {
        await d.resetWorkspace(initialCloudSync);
      } else {
        d.updateCloudSync?.(initialCloudSync);
      }
      const freshSnap: AppDatabaseSnapshot = d.exportSnapshot();
      const pushRes = await d.push(initialCloudSync, freshSnap);
      const finalCloudSync: AppSettings['cloudSync'] = pushRes.ok
        ? { ...initialCloudSync, lastSyncedAt: pushRes.syncedAt }
        : initialCloudSync;
      if (pushRes.ok) {
        d.updateCloudSync?.(finalCloudSync);
      }
      if (params.isMobile && params.mobileLock?.currentMonthKey) {
        d.saveMobileMonth?.(params.mobileLock.currentMonthKey);
      }
      d.clearPending();
      return {
        ok: true,
        mode: 'switched-new',
        message: pushRes.ok
          ? `Initialized new Property Space "${nextCode}". Dashboard reset and synced via ${params.networkLabel}.`
          : `Workspace reset for "${nextCode}" locally (${pushRes.message || 'push pending'}). Tap Sync Push when ready.`,
        appliedCloudSync: finalCloudSync,
        requiresReload: true,
        dataChanged: true,
      };
    }

    return {
      ok: false,
      mode: 'blocked',
      message: `Could not verify Property Space "${nextCode}" (${pullRes.message}). Current data for "${prevCode}" was kept.`,
      appliedCloudSync: { ...baseTargetCloudSync, propertyCode: prevCode },
      requiresReload: false,
      dataChanged: false,
    };
  }

  // Same Property Space Code: merge bidirectional updates and push
  const localSnap = d.exportSnapshot();
  let finalSnap = localSnap;
  let didImportMerged = false;

  if (pullRes.ok && pullRes.snapshot) {
    finalSnap = d.mergeSnapshots(localSnap, pullRes.snapshot);
    d.importSnapshot(finalSnap, { preserveLocalSecurity: true });
    didImportMerged = true;
    d.clearPending();
  }

  const pushRes = await d.push(baseTargetCloudSync, finalSnap);
  if (pushRes.ok) {
    d.clearPending();
    const syncedCloudSync: AppSettings['cloudSync'] = {
      ...baseTargetCloudSync,
      lastSyncedAt: pushRes.syncedAt,
    };
    d.updateCloudSync?.(syncedCloudSync);
    return {
      ok: true,
      mode: 'merged-same-code',
      message: `Synced "${nextCode}" via ${params.networkLabel} at ${new Date().toLocaleTimeString()}.`,
      appliedCloudSync: syncedCloudSync,
      requiresReload: true,
      dataChanged: true,
    };
  }

  return {
    ok: true,
    mode: 'merged-same-code',
    message: pushRes.message || 'Data saved locally in IndexedDB.',
    appliedCloudSync: baseTargetCloudSync,
    requiresReload: didImportMerged,
    dataChanged: didImportMerged,
  };
}
