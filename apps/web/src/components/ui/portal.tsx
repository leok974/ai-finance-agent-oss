/**
 * Portal.tsx - Iframe-aware portal wrapper for Radix UI
 *
 * This component ensures all Radix portals (Dialog, Popover, Tooltip, etc.)
 * target the correct document when running inside the chat iframe.
 *
 * Usage: Wrap Radix portal content with this component
 * <Portal><DialogContent>...</DialogContent></Portal>
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '@/lib/portalRoot';

interface PortalProps {
  children: React.ReactNode;
  /**
   * Optional container override. If not provided, uses the PortalContainerContext
   * which will be the iframe's document.body for chat, or main document.body otherwise.
   */
  container?: HTMLElement | null;
}

/**
 * Portal component that respects iframe boundaries.
 * Automatically uses the correct portal container from context.
 */
export function Portal({ children, container }: PortalProps) {
  const contextContainer = usePortalContainer();
  const targetContainer = container ?? contextContainer ?? document.body;

  return createPortal(children, targetContainer);
}
