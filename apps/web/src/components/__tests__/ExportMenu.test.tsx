import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportMenu from "../ExportMenu";
import * as api from "@/lib/api";
import { toast } from "sonner";

// Mock dependencies
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/utils/download", () => ({
  saveAs: vi.fn(),
}));

describe("ExportMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders export menu trigger button", () => {
    render(<ExportMenu month="2025-11" />);

    const trigger = screen.getByTestId("export-menu-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Export");
  });

  it("calls Excel export endpoint when clicking summary preset", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["test"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const spy = vi.spyOn(api, "downloadReportExcel").mockResolvedValue({
      blob: mockBlob,
      filename: "report-2025-11.xlsx",
    });

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click Excel summary preset
    const summaryButton = await screen.findByTestId("export-excel-summary");
    await user.click(summaryButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2025-11", "summary", {
        start: undefined,
        end: undefined,
        splitAlpha: false,
      });
    });

    // Should show success toast
    expect(toast.success).toHaveBeenCalledWith("Exported 2025-11 to Excel");
  });

  it("calls Excel export with full mode preset", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["test"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const spy = vi.spyOn(api, "downloadReportExcel").mockResolvedValue({
      blob: mockBlob,
      filename: "report-2025-11.xlsx",
    });

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click Excel full preset
    const fullButton = await screen.findByTestId("export-excel-full");
    await user.click(fullButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2025-11", "full", {
        start: undefined,
        end: undefined,
        splitAlpha: false,
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Exported 2025-11 to Excel");
  });

  it("calls Excel export with unknowns mode preset", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["test"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const spy = vi.spyOn(api, "downloadReportExcel").mockResolvedValue({
      blob: mockBlob,
      filename: "report-2025-11.xlsx",
    });

    render(<ExportMenu month="2025-11" hasUnknowns={true} />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click Excel unknowns preset
    const unknownsButton = await screen.findByTestId("export-excel-unknowns");
    await user.click(unknownsButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2025-11", "unknowns", {
        start: undefined,
        end: undefined,
        splitAlpha: false,
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Exported 2025-11 to Excel");
  });

  it("calls PDF export endpoint when clicking PDF menu item", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["test"], { type: "application/pdf" });
    const spy = vi.spyOn(api, "downloadReportPdf").mockResolvedValue({
      blob: mockBlob,
      filename: "report-2025-11.pdf",
    });

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click PDF export
    const pdfButton = await screen.findByTestId("export-pdf-summary");
    await user.click(pdfButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2025-11", "summary", {
        start: undefined,
        end: undefined,
      });
    });

    // Should show success toast
    expect(toast.success).toHaveBeenCalledWith("Exported 2025-11 to PDF");
  });

  it("shows error toast when Excel export fails", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "downloadReportExcel").mockRejectedValue(
      new Error("Excel export failed: 500")
    );

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click Excel export
    const excelButton = await screen.findByTestId("export-excel-summary");
    await user.click(excelButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });

    // Should show error toast
    expect(toast.error).toHaveBeenCalledWith("Excel export failed: 500");
  });

  it("shows error toast when PDF export fails", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "downloadReportPdf").mockRejectedValue(
      new Error("PDF export failed: 503")
    );

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click PDF export
    const pdfButton = await screen.findByTestId("export-pdf-summary");
    await user.click(pdfButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });

    // Should show error toast
    expect(toast.error).toHaveBeenCalledWith("PDF export failed: 503");
  });

  it("disables unknowns preset when hasUnknowns is false", async () => {
    const user = userEvent.setup();
    render(<ExportMenu month="2025-11" hasUnknowns={false} />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Unknowns button should be disabled
    const unknownsButton = await screen.findByTestId("export-excel-unknowns");
    expect(unknownsButton).toHaveAttribute("aria-disabled", "true");
  });

  it("split alpha option toggles correctly", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["test"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const spy = vi.spyOn(api, "downloadReportExcel").mockResolvedValue({
      blob: mockBlob,
      filename: "report-2025-11.xlsx",
    });

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Find and check "Split transactions A-M / N-Z"
    const splitAlphaCheckbox = await screen.findByRole("menuitemcheckbox", { name: /split transactions/i });
    await user.click(splitAlphaCheckbox);

    // Re-open dropdown (clicking checkbox closes it)
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click Excel full preset
    const excelButton = await screen.findByTestId("export-excel-full");
    await user.click(excelButton);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2025-11", "full", {
        start: undefined,
        end: undefined,
        splitAlpha: true,
      });
    });
  });

  it("disables buttons while export is in progress", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["test"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    let resolveExport: (value: any) => void;
    const exportPromise = new Promise((resolve) => {
      resolveExport = resolve;
    });

    vi.spyOn(api, "downloadReportExcel").mockReturnValue(exportPromise as any);

    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Click Excel export
    const excelButton = await screen.findByTestId("export-excel-summary");
    await user.click(excelButton);

    // Main trigger button should be disabled while exporting
    const trigger = screen.getByTestId("export-menu-trigger");
    await waitFor(() => {
      expect(trigger).toBeDisabled();
    });

    // Resolve the export
    resolveExport!({ blob: mockBlob, filename: "test.xlsx" });

    // Button should be enabled again
    await waitFor(() => {
      expect(trigger).not.toBeDisabled();
    });
  });

  it("displays proper labels and icons for Excel presets", async () => {
    const user = userEvent.setup();
    render(<ExportMenu month="2025-11" />);

    // Open dropdown
    await user.click(screen.getByTestId("export-menu-trigger"));

    // Check for Excel preset labels
    expect(screen.getByText("Summary only")).toBeInTheDocument();
    expect(screen.getByText("Full details")).toBeInTheDocument();
    expect(screen.getByText("Unknowns only")).toBeInTheDocument();

    // Check for PDF label
    expect(screen.getByText("Summary PDF")).toBeInTheDocument();
  });
});
