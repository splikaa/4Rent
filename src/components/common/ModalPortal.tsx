import React from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../utils/bodyScrollLock';

interface ModalPortalProps {
  isOpen: boolean;
  /**
   * Keeps rendering in-tree (for example, ReceiptModal print layout) while
   * still applying reference-counted background scroll locking.
   */
  disablePortal?: boolean;
  children: React.ReactNode;
}

/**
 * Renders modal overlays directly under `document.body` so ancestor animations,
 * transforms, or scroll containers can never trap `position: fixed` overlays,
 * while automatically locking background page scrolling while open.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({
  isOpen,
  disablePortal = false,
  children,
}) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  if (disablePortal || typeof document === 'undefined' || !document.body) {
    return <>{children}</>;
  }

  return createPortal(children, document.body);
};
