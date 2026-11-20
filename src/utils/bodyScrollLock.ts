import { useEffect } from 'react';

interface ScrollLockDocument {
  documentElement: {
    style: {
      overflow: string;
      overscrollBehaviorY: string;
    };
    clientWidth: number;
  };
  body: {
    style: {
      overflow: string;
      paddingRight: string;
      overscrollBehaviorY: string;
    };
  };
}

interface ScrollLockWindow {
  innerWidth: number;
}

interface SavedScrollStyles {
  htmlOverflow: string;
  htmlOverscrollY: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
  bodyOverscrollY: string;
}

let activeScrollLockCount = 0;
let savedStyles: SavedScrollStyles | null = null;

function resolveDocument(doc?: ScrollLockDocument): ScrollLockDocument | null {
  if (doc) return doc;
  if (typeof document === 'undefined' || !document.body || !document.documentElement) {
    return null;
  }
  return document as unknown as ScrollLockDocument;
}

function resolveWindow(win?: ScrollLockWindow): ScrollLockWindow | null {
  if (win) return win;
  if (typeof window === 'undefined') return null;
  return window as unknown as ScrollLockWindow;
}

/**
 * Acquires a reference-counted viewport scroll lock while a modal is open.
 * Keeps background scrolling disabled even across stacked modals and compensates
 * desktop scrollbar width so background content does not shift horizontally.
 */
export function acquireBodyScrollLock(
  doc?: ScrollLockDocument,
  win?: ScrollLockWindow
): void {
  const targetDoc = resolveDocument(doc);
  if (!targetDoc) return;

  if (activeScrollLockCount === 0) {
    savedStyles = {
      htmlOverflow: targetDoc.documentElement.style.overflow,
      htmlOverscrollY: targetDoc.documentElement.style.overscrollBehaviorY,
      bodyOverflow: targetDoc.body.style.overflow,
      bodyPaddingRight: targetDoc.body.style.paddingRight,
      bodyOverscrollY: targetDoc.body.style.overscrollBehaviorY,
    };

    const targetWin = resolveWindow(win);
    const scrollbarWidth = targetWin
      ? Math.max(0, targetWin.innerWidth - targetDoc.documentElement.clientWidth)
      : 0;

    targetDoc.documentElement.style.overflow = 'hidden';
    targetDoc.documentElement.style.overscrollBehaviorY = 'none';
    targetDoc.body.style.overflow = 'hidden';
    targetDoc.body.style.overscrollBehaviorY = 'none';
    if (scrollbarWidth > 0) {
      targetDoc.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeScrollLockCount += 1;
}

/**
 * Releases one scroll lock holder; restores exact prior inline styles once the
 * last active modal closes.
 */
export function releaseBodyScrollLock(doc?: ScrollLockDocument): void {
  if (activeScrollLockCount <= 0) {
    activeScrollLockCount = 0;
    return;
  }

  activeScrollLockCount -= 1;

  if (activeScrollLockCount === 0 && savedStyles) {
    const targetDoc = resolveDocument(doc);
    if (targetDoc) {
      targetDoc.documentElement.style.overflow = savedStyles.htmlOverflow;
      targetDoc.documentElement.style.overscrollBehaviorY =
        savedStyles.htmlOverscrollY;
      targetDoc.body.style.overflow = savedStyles.bodyOverflow;
      targetDoc.body.style.paddingRight = savedStyles.bodyPaddingRight;
      targetDoc.body.style.overscrollBehaviorY = savedStyles.bodyOverscrollY;
    }
    savedStyles = null;
  }
}

export function getActiveScrollLockCount(): number {
  return activeScrollLockCount;
}

export function resetBodyScrollLockForTests(): void {
  activeScrollLockCount = 0;
  savedStyles = null;
}

export function useBodyScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;
    acquireBodyScrollLock();
    return () => {
      releaseBodyScrollLock();
    };
  }, [isLocked]);
}
