import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportMenu from "../ExportMenu";

// Mock the download helpers
vi.mock("@/lib/api", () => ({
  downloadReportExcel: vi.fn(async () => ({
    blob: new Blob(["mock excel"], { type: "application/vnd.ms-excel" }),
    filename: "ledgermind-full-2025-01.xlsx",
  })),
  downloadReportPdf: vi.fn(async () => ({
    blob: new Blob(["mock pdf"], { type: "application/pdf" }),
    filename: "ledgermind-report-2025-01.pdf",
  })),
}));

// Mock saveAs
vi.mock("@/utils/download", () => ({
  saveAs: vi.fn(),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ExportMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables the trigger button when hasAnyTransactions is false", () => {
    render(<ExportMenu month="2025-01" hasAnyTransactions={false} />);

    const trigger = screen.getByTestId("export-menu-trigger");
    expect(trigger).toBeDisabled();
  });

  it("enables the trigger button when hasAnyTransactions is true", () => {
    render(<ExportMenu month="2025-01" hasAnyTransactions={true} />);

    const trigger = screen.getByTestId("export-menu-trigger");
    expect(trigger).not.toBeDisabled();
  });

  it("disables the unknowns option when hasUnknowns is false", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    await waitFor(() => {
      const unknownsOption = screen.getByTestId("export-option-excel-unknowns");
      expect(unknownsOption).toHaveAttribute("data-disabled");
    });
  });

  it("enables the unknowns option when hasUnknowns is true", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={true}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    await waitFor(() => {
      const unknownsOption = screen.getByTestId("export-option-excel-unknowns");
      expect(unknownsOption).not.toHaveAttribute("data-disabled", "true");
    });
  });

  it("calls downloadReportExcel with correct parameters for summary", async () => {
    const { downloadReportExcel } = await import("@/lib/api");
    const { saveAs } = await import("@/utils/download");
    const user = userEvent.setup();

    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    const summaryOption = await screen.findByTestId("export-option-excel-summary");
    await user.click(summaryOption);

    await waitFor(() => {
      expect(downloadReportExcel).toHaveBeenCalledWith("2025-01", "summary");
      expect(saveAs).toHaveBeenCalledWith(
        expect.any(Blob),
        "ledgermind-full-2025-01.xlsx"
      );
    });
  });

  it("calls downloadReportPdf with correct parameters", async () => {
    const { downloadReportPdf } = await import("@/lib/api");
    const { saveAs } = await import("@/utils/download");
    const user = userEvent.setup();

    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    const pdfOption = await screen.findByTestId("export-option-pdf-summary");
    await user.click(pdfOption);

    await waitFor(() => {
      expect(downloadReportPdf).toHaveBeenCalledWith("2025-01", "summary");
      expect(saveAs).toHaveBeenCalledWith(
        expect.any(Blob),
        "ledgermind-report-2025-01.pdf"
      );
    });
  });

  it("shows toast success message after successful export", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();

    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    const summaryOption = await screen.findByTestId("export-option-excel-summary");
    await user.click(summaryOption);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Excel export started")
      );
    });
  });

  it("shows toast error message when export fails", async () => {
    const { downloadReportExcel } = await import("@/lib/api");
    const { toast } = await import("sonner");
    const user = userEvent.setup();

    // Make the download fail
    vi.mocked(downloadReportExcel).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    const summaryOption = await screen.findByTestId("export-option-excel-summary");
    await user.click(summaryOption);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Export failed")
      );
    });
  });

  it("renders all export options", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        month="2025-01"
        hasAnyTransactions={true}
        hasUnknowns={true}
      />
    );

    const trigger = screen.getByTestId("export-menu-trigger");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByTestId("export-option-excel-summary")).toBeInTheDocument();
      expect(screen.getByTestId("export-option-excel-full")).toBeInTheDocument();
      expect(screen.getByTestId("export-option-excel-unknowns")).toBeInTheDocument();
      expect(screen.getByTestId("export-option-pdf-summary")).toBeInTheDocument();
      expect(screen.getByTestId("export-option-pdf-full")).toBeInTheDocument();
    });
  });
});
