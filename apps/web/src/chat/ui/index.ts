/**
 * chat/ui/index.ts - Barrel export for iframe-aware UI components
 *
 * Re-exports all patched Radix components that use Portal to target iframe document.
 * Chat code should import from './ui' instead of '@/components/ui' to get these versions.
 */

export * from './Portal';
export * from './dropdown-menu';
export * from './tooltip';
export * from './toast';
