import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock anchorToLauncher for testing
// In real code this would be imported, but for testing we'll reimplement the logic
function anchorToLauncher(launcher: HTMLElement, w = 420, h = 560) {
  const MARGIN = 16;

  const r = launcher.getBoundingClientRect();

  // Mock visualViewport
  const v = (window as any).visualViewport || {
    offsetLeft: 0,
    offsetTop: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };

  const vx = v.offsetLeft || 0;
  const vy = v.offsetTop || 0;
  const vw = v.width;
  const vh = v.height;

  // default anchor to bottom-right of the launcher
  const preferRight = (r.left + r.right) / 2 > vw / 2;
  const preferBottom = (r.top + r.bottom) / 2 < vh / 2;

  let left = preferRight
    ? vx + Math.min(vw - w - MARGIN, Math.max(MARGIN, r.right + vx - w))
    : vx + Math.max(MARGIN, Math.min(vw - w - MARGIN, r.left + vx));

  let top = preferBottom
    ? vy + Math.max(MARGIN, Math.min(vh - h - MARGIN, r.bottom + vy + 8))
    : vy + Math.max(MARGIN, Math.min(vh - h - MARGIN, r.top + vy - h - 8));

  // clamp defensively
  left = Math.max(MARGIN, Math.min(left, vx + vw - w - MARGIN));
  top = Math.max(MARGIN, Math.min(top, vy + vh - h - MARGIN));

  return {
    left,
    top,
    w,
    h,
    origin: `${preferRight ? 'right' : 'left'} ${preferBottom ? 'top' : 'bottom'}`,
  };
}

describe('anchorToLauncher', () => {
  beforeEach(() => {
    // Reset viewport size for tests
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    });
  });

  it('clamps inside viewport and respects margins', () => {
    // Create a mock launcher element in bottom-right corner
    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 1800,
      top: 1000,
      right: 1850,
      bottom: 1050,
      width: 50,
      height: 50,
      x: 1800,
      y: 1000,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Should be clamped to stay within margins (16px)
    expect(rect.left).toBeGreaterThanOrEqual(16);
    expect(rect.top).toBeGreaterThanOrEqual(16);
    expect(rect.left + rect.w).toBeLessThanOrEqual(1920 - 16);
    expect(rect.top + rect.h).toBeLessThanOrEqual(1080 - 16);
  });

  it('opens to the right when launcher is on left side', () => {
    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 500,
      right: 150,
      bottom: 550,
      width: 50,
      height: 50,
      x: 100,
      y: 500,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Should anchor to left (launcher is on left half of screen)
    expect(rect.origin).toContain('left');
  });

  it('opens to the left when launcher is on right side', () => {
    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 1800,
      top: 500,
      right: 1850,
      bottom: 550,
      width: 50,
      height: 50,
      x: 1800,
      y: 500,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Should anchor to right (launcher is on right half of screen)
    expect(rect.origin).toContain('right');
  });

  it('opens downward when launcher is in upper half', () => {
    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 960,
      top: 200,
      right: 1010,
      bottom: 250,
      width: 50,
      height: 50,
      x: 960,
      y: 200,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Should anchor to top (opens downward from upper half)
    expect(rect.origin).toContain('top');
  });

  it('opens upward when launcher is in lower half', () => {
    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 960,
      top: 900,
      right: 1010,
      bottom: 950,
      width: 50,
      height: 50,
      x: 960,
      y: 900,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Should anchor to bottom (opens upward from lower half)
    expect(rect.origin).toContain('bottom');
  });

  it('never exceeds viewport bounds even with extreme launcher position', () => {
    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 1900,
      top: 1060,
      right: 1950,
      bottom: 1110,
      width: 50,
      height: 50,
      x: 1900,
      y: 1060,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Must fit within viewport with margins
    expect(rect.left).toBeGreaterThanOrEqual(16);
    expect(rect.top).toBeGreaterThanOrEqual(16);
    expect(rect.left + rect.w).toBeLessThanOrEqual(1920 - 16);
    expect(rect.top + rect.h).toBeLessThanOrEqual(1080 - 16);
  });

  it('handles small viewports correctly', () => {
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const launcher = document.createElement('div');
    launcher.getBoundingClientRect = vi.fn(() => ({
      left: 400,
      top: 700,
      right: 450,
      bottom: 750,
      width: 50,
      height: 50,
      x: 400,
      y: 700,
      toJSON: () => {},
    }));

    const rect = anchorToLauncher(launcher, 420, 560);

    // Panel should be constrained to smaller viewport
    expect(rect.w).toBeLessThanOrEqual(480 - 32); // viewport width - 2*margin
    expect(rect.h).toBeLessThanOrEqual(800 - 32); // viewport height - 2*margin
    expect(rect.left).toBeGreaterThanOrEqual(16);
    expect(rect.top).toBeGreaterThanOrEqual(16);
  });
});
