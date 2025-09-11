import { vi, describe, it, expect, beforeEach } from "vitest";
import { handleApply } from "../lib/planHandleApply";
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
    await handleApply({ res, month: "2025-08", selected: [{ kind: "export_report" }] });

    expect((window as any).location.href).toBe(res.report_url);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("falls back to downloadReportExcel when no report_url", async () => {
    const res = { ok: true, ack: "ok" };
    await handleApply({ res, month: "2025-08", selected: [{ kind: "export_report" }] });

    expect(mockDownload).toHaveBeenCalledWith("2025-08", true, { splitAlpha: true });
    expect((window as any).location.href).toBe("");
  });

  it("does nothing when no export_report action", async () => {
    const res = { ok: true, ack: "ok" };
    await handleApply({ res, month: "2025-08", selected: [{ kind: "categorize_unknowns" }] });

    expect(mockDownload).not.toHaveBeenCalled();
    expect((window as any).location.href).toBe("");
  });

  it("does not throw if month is missing and no report_url", async () => {
    const res = { ok: true, ack: "ok" };

    // deliberately pass no month
    await expect(
      handleApply({ res, month: undefined, selected: [{ kind: "export_report" }] })
    ).resolves.toEqual(res);

    // verify no download attempts
    expect(mockDownload).not.toHaveBeenCalled();
    expect((window as any).location.href).toBe("");
  });
});
