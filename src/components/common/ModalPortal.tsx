import React from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../utils/bodyScrollLock';
import { useModalEscapeHandler } from '../../utils/modalStack';

interface ModalPortalProps {
  isOpen: boolean;
  /**
   * Optional Escape-key close handler managed in a centralized LIFO modal stack
   * so pressing Escape closes only the top-most open modal.
   */
  onRequestClose?: () => void;
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
 * while automatically locking background page scrolling and coordinating Escape
 * dismissal across stacked modals.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({
  isOpen,
  onRequestClose,
  disablePortal = false,
  children,
}) => {
  useBodyScrollLock(isOpen);
  useModalEscapeHandler(isOpen, onRequestClose);

  if (!isOpen) return null;

  if (disablePortal || typeof document === 'undefined' || !document.body) {
    return <>{children}</>;
  }

  return createPortal(children, document.body);
};
