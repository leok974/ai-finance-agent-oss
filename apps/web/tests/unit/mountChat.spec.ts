import { describe, it, expect } from "vitest";
import { computePanelRect } from "@/boot/mountChat";

// Helper to create mock launcher element
const mockLauncher = (left: number, top: number, width: number, height: number) => ({
  getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }),
}) as HTMLElement;

describe("computePanelRect", () => {
  it("clamps width/height to viewport and anchors right-bottom when near bottom-right", () => {
    (global as any).visualViewport = { width: 1280, height: 720, offsetLeft: 0, offsetTop: 0 };
    const launcher = mockLauncher(1200, 640, 40, 40);
    const r = computePanelRect(launcher, 420, 560, 16);

    expect(r.width).toBeLessThanOrEqual(1280 - 32);
    expect(r.height).toBeLessThanOrEqual(720 - 32);
    expect(r.left + r.width).toBeLessThanOrEqual(1280);
    expect(r.top + r.height).toBeLessThanOrEqual(720);
    expect(r.anchor).toBe('rb'); // right-bottom
  });

  it("anchors to left-top when launcher is on left half near top", () => {
    (global as any).visualViewport = { width: 1280, height: 720, offsetLeft: 0, offsetTop: 0 };
    const launcher = mockLauncher(100, 100, 40, 40);
    const r = computePanelRect(launcher, 420, 560, 16);

    expect(r.anchor).toBe('lt'); // left-top
    expect(r.left).toBeGreaterThanOrEqual(16);
    expect(r.top).toBeGreaterThanOrEqual(16);
  });

  it("respects visual viewport offsets (zoom/keyboard)", () => {
    (global as any).visualViewport = { width: 980, height: 500, offsetLeft: 100, offsetTop: 200 };
    const launcher = mockLauncher(100 + 800, 200 + 450, 30, 30);
    const r = computePanelRect(launcher, 420, 560, 16);

    // Panel stays within offset viewport
    expect(r.left).toBeGreaterThanOrEqual(100 + 16);
    expect(r.top).toBeGreaterThanOrEqual(200 + 16);
    expect(r.left + r.width).toBeLessThanOrEqual(100 + 980 - 16);
    expect(r.top + r.height).toBeLessThanOrEqual(200 + 500 - 16);
  });

  it("handles tiny viewports gracefully", () => {
    (global as any).visualViewport = { width: 320, height: 480, offsetLeft: 0, offsetTop: 0 };
    const launcher = mockLauncher(280, 440, 30, 30);
    const r = computePanelRect(launcher, 420, 560, 16);

    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.width).toBeLessThanOrEqual(320 - 32);
    expect(r.height).toBeLessThanOrEqual(480 - 32);
  });

  it("opens above when not enough room below", () => {
    (global as any).visualViewport = { width: 1280, height: 720, offsetLeft: 0, offsetTop: 0 };
    const launcher = mockLauncher(640, 680, 40, 20);
    const r = computePanelRect(launcher, 420, 560, 16);

    expect(r.anchor).toMatch(/b$/); // ends with 'b' (rb or lb)
  });
});
