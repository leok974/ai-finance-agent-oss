import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportMenu from "../ExportMenu";
import * as api from "@/lib/api";

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
  const downloadExcelSpy = vi
    .spyOn(api, "downloadExcelReport")
    .mockResolvedValue({ blob: new Blob(), filename: "test.xlsx" } as any);
  const downloadPdfSpy = vi
    .spyOn(api, "downloadPdfReport")
    .mockResolvedValue({ blob: new Blob(), filename: "test.pdf" } as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openMenu = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId("export-menu-trigger"));
  };

  it("shows a 'no data' message when there are no transactions", async () => {
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={false}
        hasUnknowns={false}
      />
    );
    await openMenu();
    expect(
      screen.getByText(/no data available for 2025-11/i)
    ).toBeInTheDocument();
  });

  it("disables unknowns-only export when there are no unknowns", async () => {
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );
    await openMenu();
    const opt = screen.getByTestId("export-option-excel-unknowns");
    expect(opt).toHaveAttribute("data-disabled");
  });

  it("calls Excel full export when that option is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={true}
      />
    );
    await openMenu();
    const opt = screen.getByTestId("export-option-excel-full");
    await user.click(opt);

    await waitFor(() => {
      expect(downloadExcelSpy).toHaveBeenCalledWith({
        month: "2025-11",
        mode: "full",
        filters: undefined,
      });
    });
  });

  it("calls PDF export when that option is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={true}
      />
    );
    await openMenu();
    const opt = screen.getByTestId("export-option-pdf-monthly");
    await user.click(opt);

    await waitFor(() => {
      expect(downloadPdfSpy).toHaveBeenCalledWith({
        month: "2025-11",
        mode: "full",
      });
    });
  });

  it("disables trigger button when no transactions", () => {
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={false}
        hasUnknowns={false}
      />
    );
    const trigger = screen.getByTestId("export-menu-trigger");
    expect(trigger).toBeDisabled();
  });

  it("enables trigger button when has transactions", () => {
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );
    const trigger = screen.getByTestId("export-menu-trigger");
    expect(trigger).not.toBeDisabled();
  });

  it("renders all export options when menu is opened", async () => {
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={true}
      />
    );
    await openMenu();

    expect(screen.getByTestId("export-option-excel-summary")).toBeInTheDocument();
    expect(screen.getByTestId("export-option-excel-full")).toBeInTheDocument();
    expect(screen.getByTestId("export-option-excel-unknowns")).toBeInTheDocument();
    expect(screen.getByTestId("export-option-pdf-monthly")).toBeInTheDocument();
  });

  it("shows success toast after successful export", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );
    await openMenu();
    const opt = screen.getByTestId("export-option-excel-summary");
    await user.click(opt);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Excel export started")
      );
    });
  });

  it("shows error toast when export fails", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    downloadExcelSpy.mockRejectedValueOnce({ status: 404 });

    render(
      <ExportMenu
        month="2025-11"
        hasAnyTransactions={true}
        hasUnknowns={false}
      />
    );
    await openMenu();
    const opt = screen.getByTestId("export-option-excel-summary");
    await user.click(opt);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("No data to export")
      );
    });
  });
});
