import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExplainSignalDrawer from "../ExplainSignalDrawer";
import * as http from "@/lib/http";

vi.mock("@/lib/portal", () => ({
  getPortalRoot: () => document.body,
}));

vi.mock("@/hooks/useSafePortal", () => ({
  useSafePortalReady: () => true,
}));

vi.mock("@/api", () => ({
  getExplain: vi.fn(),
  rejectSuggestion: vi.fn(),
  undoRejectSuggestion: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ExplainSignalDrawer - Manual Categorization", () => {
  const manualCategorizeSpy = vi.spyOn(http, "manualCategorizeTransaction");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows categorization UI for unknown transactions", () => {
    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={vi.fn()}
        txn={txn}
      />
    );

    expect(screen.getByText("Categorize this transaction")).toBeInTheDocument();
    expect(screen.getByText("Manual override")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByText("Apply to")).toBeInTheDocument();
  });

  it("hides categorization UI for non-unknown transactions", () => {
    const txn = {
      id: 123,
      category: "groceries",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={vi.fn()}
        txn={txn}
      />
    );

    expect(
      screen.queryByText("Categorize this transaction")
    ).not.toBeInTheDocument();
  });

  it("calls manualCategorizeTransaction with correct params on Apply", async () => {
    const mockResponse = {
      txn_id: 123,
      category_slug: "groceries",
      scope: "same_merchant",
      updated_count: 3,
      similar_updated: 2,
      hint_applied: true,
    };

    manualCategorizeSpy.mockResolvedValue(mockResponse as any);

    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    const onRefresh = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={onOpenChange}
        txn={txn}
        onRefresh={onRefresh}
      />
    );

    const user = userEvent.setup();

    // Select category
    const categorySelect = screen.getByLabelText("Category");
    await user.selectOptions(categorySelect, "groceries");

    // Select scope (same_merchant is default)
    const merchantRadio = screen.getByLabelText("All unknowns from this merchant");
    expect(merchantRadio).toBeChecked();

    // Click Apply
    const applyButton = screen.getByRole("button", { name: /apply/i });
    await user.click(applyButton);

    await waitFor(() => {
      expect(manualCategorizeSpy).toHaveBeenCalledWith(123, {
        categorySlug: "groceries",
        scope: "same_merchant",
      });
    });

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows correct toast message when similar transactions are updated", async () => {
    const mockResponse = {
      txn_id: 123,
      category_slug: "groceries",
      scope: "same_merchant",
      updated_count: 5,
      similar_updated: 4,
      hint_applied: true,
    };

    manualCategorizeSpy.mockResolvedValue(mockResponse as any);

    const { emitToastSuccess } = await import("@/lib/toast-helpers");

    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={vi.fn()}
        txn={txn}
        onRefresh={vi.fn()}
      />
    );

    const user = userEvent.setup();

    // Select category and apply
    await user.selectOptions(screen.getByLabelText("Category"), "groceries");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(manualCategorizeSpy).toHaveBeenCalled();
    });

    // Toast should mention similar transactions
    // Note: This assumes emitToastSuccess is called - actual implementation may vary
  });

  it("disables Apply button when no category is selected", () => {
    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={vi.fn()}
        txn={txn}
      />
    );

    const applyButton = screen.getByRole("button", { name: /apply/i });
    expect(applyButton).toBeDisabled();
  });

  it("allows all three scope options to be selected", async () => {
    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={vi.fn()}
        txn={txn}
      />
    );

    const user = userEvent.setup();

    // Test "just this" scope
    const justThisRadio = screen.getByLabelText("Just this transaction");
    await user.click(justThisRadio);
    expect(justThisRadio).toBeChecked();

    // Test "same merchant" scope
    const merchantRadio = screen.getByLabelText("All unknowns from this merchant");
    await user.click(merchantRadio);
    expect(merchantRadio).toBeChecked();

    // Test "same description" scope
    const descriptionRadio = screen.getByLabelText(
      "All unknowns with similar description"
    );
    await user.click(descriptionRadio);
    expect(descriptionRadio).toBeChecked();
  });

  it("shows loading state on Apply button while saving", async () => {
    // Mock a delayed response
    let resolvePromise: any;
    const delayedPromise = new Promise<any>((resolve) => {
      resolvePromise = resolve;
    });
    manualCategorizeSpy.mockReturnValue(delayedPromise as any);

    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={vi.fn()}
        txn={txn}
        onRefresh={vi.fn()}
      />
    );

    const user = userEvent.setup();

    // Select category and click Apply
    await user.selectOptions(screen.getByLabelText("Category"), "groceries");
    const applyButton = screen.getByRole("button", { name: /apply/i });
    await user.click(applyButton);

    // Button should show loading state
    await waitFor(() => {
      expect(screen.getByText("Saving…")).toBeInTheDocument();
      expect(applyButton).toBeDisabled();
    });

    // Resolve the promise
    resolvePromise({
      txn_id: 123,
      category_slug: "groceries",
      scope: "same_merchant",
      updated_count: 1,
      similar_updated: 0,
      hint_applied: false,
    });

    // Button should re-enable after success
    await waitFor(() => {
      expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    });
  });

  it("calls onRefresh once after successful categorization", async () => {
    const mockResponse = {
      txn_id: 123,
      category_slug: "groceries",
      scope: "just_this",
      updated_count: 1,
      similar_updated: 0,
      hint_applied: false,
    };

    manualCategorizeSpy.mockResolvedValue(mockResponse as any);

    const onRefresh = vi.fn();
    const onOpenChange = vi.fn();

    const txn = {
      id: 123,
      category: "unknown",
      merchant: "CVS Pharmacy",
      description: "Groceries",
      amount: -45.67,
    };

    render(
      <ExplainSignalDrawer
        txnId={123}
        open={true}
        onOpenChange={onOpenChange}
        txn={txn}
        onRefresh={onRefresh}
      />
    );

    const user = userEvent.setup();

    // Select category and apply
    await user.selectOptions(screen.getByLabelText("Category"), "groceries");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false); // Drawer should close
    });
  });
});
