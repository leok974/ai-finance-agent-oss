import { vi, describe, it, expect, beforeEach } from "vitest";
import { handleApply } from "../components/dev/PlannerDevPanel";
import * as api from "../lib/api";

// mock helpers
const mockDownload = vi.fn();
const mockHref = vi.fn();

beforeEach(() => {
  vi.spyOn(api, "downloadReportExcel").mockImplementation(mockDownload as any);
  Object.defineProperty(window, "location", {
    value: { href: "", assign: mockHref },
    writable: true,
  });
  mockDownload.mockReset();
  mockHref.mockReset();
});

describe("plan apply export behavior", () => {
  it("uses backend report_url when present", async () => {
    const res = {
      ok: true,
      ack: "ok",
      report_url: "http://localhost:8000/report/excel?month=2025-08",
    };
  await handleApply({ res, month: "2025-08", selected: [{ kind: "export_report", title: "Export", impact: "low", month: "2025-08" }] as any });

    expect((window as any).location.href).toBe(res.report_url);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("falls back to downloadReportExcel when no report_url", async () => {
    const res = { ok: true, ack: "ok" };
  await handleApply({ res, month: "2025-08", selected: [{ kind: "export_report", title: "Export", impact: "low", month: "2025-08" }] as any });

    expect(mockDownload).toHaveBeenCalledWith("2025-08", true, { splitAlpha: true });
    expect((window as any).location.href).toBe("");
  });

  it("does nothing when no export_report action", async () => {
    const res = { ok: true, ack: "ok" };
  await handleApply({ res, month: "2025-08", selected: [{ kind: "categorize_unknowns", title: "Cat", txn_ids: [], impact: "high" }] as any });

    expect(mockDownload).not.toHaveBeenCalled();
    expect((window as any).location.href).toBe("");
  });

  it("does not throw if month is missing and no report_url", async () => {
    const res = { ok: true, ack: "ok" };

    // deliberately pass no month
    await expect(
  handleApply({ res, month: undefined, selected: [{ kind: "export_report", title: "Export", impact: "low" }] as any })
    ).resolves.toEqual(res);

    // verify no download attempts
    expect(mockDownload).not.toHaveBeenCalled();
    expect((window as any).location.href).toBe("");
  });

  it("warns (but does not throw) if month is missing and no report_url", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = { ok: true, ack: "ok" };
    await expect(
  handleApply({ res, month: undefined, selected: [{ kind: "export_report", title: "Export", impact: "low" }] as any })
    ).resolves.toEqual(res);
    expect(mockDownload).not.toHaveBeenCalled();
    expect((window as any).location.href).toBe("");
    expect(warn).toHaveBeenCalledWith(
      "[Planner] export_report requested but no month resolved and no report_url from backend."
    );
    warn.mockRestore();
  });
});
