import { useEffect, useRef } from 'react';

interface ModalEscapeEntry {
  token: symbol;
  getHandler: () => (() => void) | undefined;
}

const escapeStack: ModalEscapeEntry[] = [];
let keydownBound = false;

function onGlobalKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (dispatchTopModalEscape()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function syncGlobalListener(): void {
  if (typeof window === 'undefined') return;
  if (escapeStack.length > 0 && !keydownBound) {
    window.addEventListener('keydown', onGlobalKeyDown, true);
    keydownBound = true;
  } else if (escapeStack.length === 0 && keydownBound) {
    window.removeEventListener('keydown', onGlobalKeyDown, true);
    keydownBound = false;
  }
}

export function pushModalEscapeHandler(handler: () => void): symbol {
  const token = Symbol('modal-escape');
  escapeStack.push({ token, getHandler: () => handler });
  syncGlobalListener();
  return token;
}

export function pushModalEscapeRef(
  handlerRef: { current: (() => void) | undefined }
): symbol {
  const token = Symbol('modal-escape-ref');
  escapeStack.push({
    token,
    getHandler: () => handlerRef.current,
  });
  syncGlobalListener();
  return token;
}

export function removeModalEscapeHandler(token: symbol): void {
  const idx = escapeStack.findIndex((entry) => entry.token === token);
  if (idx !== -1) {
    escapeStack.splice(idx, 1);
  }
  syncGlobalListener();
}

export function dispatchTopModalEscape(): boolean {
  for (let i = escapeStack.length - 1; i >= 0; i -= 1) {
    const handler = escapeStack[i].getHandler();
    if (handler) {
      handler();
      return true;
    }
  }
  return false;
}

export function getModalEscapeStackSize(): number {
  return escapeStack.length;
}

export function resetModalEscapeStackForTests(): void {
  escapeStack.length = 0;
  syncGlobalListener();
}

export function useModalEscapeHandler(
  isOpen: boolean,
  onRequestClose?: () => void
): void {
  const handlerRef = useRef<(() => void) | undefined>(onRequestClose);
  handlerRef.current = onRequestClose;

  const hasHandler = Boolean(onRequestClose);

  useEffect(() => {
    if (!isOpen || !hasHandler) return;
    const token = pushModalEscapeRef(handlerRef);
    return () => {
      removeModalEscapeHandler(token);
    };
  }, [isOpen, hasHandler]);
}
