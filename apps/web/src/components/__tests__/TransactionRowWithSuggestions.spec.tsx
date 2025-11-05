/**
 * Unit tests for TransactionRowWithSuggestions component
 * Tests the rendering and interaction of ML suggestion chips
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransactionRowWithSuggestions } from "../TransactionRowWithSuggestions";
import type { SuggestItem } from "@/lib/api";

// Mock transaction data
const mockTransaction = {
  id: 999001,
  merchant: "HARRIS TEETER #0085",
  merchant_canonical: "Harris Teeter",
  description: "Weekly groceries",
  amount: -64.17,
  date: "2025-11-03",
  category: null,
  deleted_at: null,
  split_parent_id: null,
  transfer_group: null,
};

const mockCategorizedTransaction = {
  ...mockTransaction,
  id: 999002,
  category: "Groceries",
};

const mockSuggestion: SuggestItem = {
  txn_id: "999001",
  event_id: "evt-test-123",
  candidates: [
    {
      label: "Groceries",
      confidence: 0.82,
      reasons: ["merchant_prior:harris teeter"],
    },
    {
      label: "Shopping",
      confidence: 0.65,
      reasons: ["keyword:grocery"],
    },
    {
      label: "General",
      confidence: 0.55,
      reasons: ["fallback"],
    },
  ],
};

describe("TransactionRowWithSuggestions", () => {
  let mockOnSelect: ReturnType<typeof vi.fn>;
  let mockOnEdit: ReturnType<typeof vi.fn>;
  let mockOnDelete: ReturnType<typeof vi.fn>;
  let mockOnAcceptSuggestion: ReturnType<typeof vi.fn>;
  let mockOnRejectSuggestion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnSelect = vi.fn();
    mockOnEdit = vi.fn();
    mockOnDelete = vi.fn();
    mockOnAcceptSuggestion = vi.fn().mockResolvedValue(undefined);
    mockOnRejectSuggestion = vi.fn();
  });

  it("renders main transaction row with all columns", () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={undefined}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText("Harris Teeter")).toBeInTheDocument();
    expect(screen.getByText("-$64.17")).toBeInTheDocument();
    expect(screen.getByText("2025-11-03")).toBeInTheDocument();
  });

  it("shows suggestion chips for uncategorized transaction", () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    // Should show suggestion chips
    expect(screen.getByText(/Groceries/)).toBeInTheDocument();
    expect(screen.getByText(/82%/)).toBeInTheDocument();
    expect(screen.getByText(/Shopping/)).toBeInTheDocument();
  });

  it("does NOT show suggestions for categorized transaction", () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockCategorizedTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    // Should NOT show suggestion row (transaction already categorized)
    expect(screen.queryByText(/82%/)).not.toBeInTheDocument();
  });

  it("calls onAcceptSuggestion when accept button clicked", async () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    // Find first suggestion chip
    const chips = screen.getAllByTestId("suggestion-chip");
    expect(chips.length).toBeGreaterThan(0);

    const firstChip = chips[0];
    expect(firstChip).toBeDefined();

    // Hover to reveal accept button
    fireEvent.mouseEnter(firstChip);

    // Find accept button using test ID (getAllByTestId since there are multiple chips)
    const acceptButtons = screen.getAllByTestId("accept-suggestion-button");
    const acceptButton = acceptButtons[0];
    expect(acceptButton).toBeDefined();

    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockOnAcceptSuggestion).toHaveBeenCalledWith(999001, "Groceries");
    });
  });

  it("calls onRejectSuggestion when reject button clicked", async () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    // Find first suggestion chip
    const chips = screen.getAllByTestId("suggestion-chip");
    const firstChip = chips[0];

    // Hover to reveal reject button
    fireEvent.mouseEnter(firstChip);

    // Find reject button using test ID (getAllByTestId since there are multiple chips)
    const rejectButtons = screen.getAllByTestId("reject-suggestion-button");
    const rejectButton = rejectButtons[0];

    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(mockOnRejectSuggestion).toHaveBeenCalledWith(999001, "Groceries");
    });
  });

  it("shows loading spinner when applying suggestion", async () => {
    // Make onAcceptSuggestion take time
    const slowAccept = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );

    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={slowAccept}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    // Trigger accept
    const chips = screen.getAllByRole("button");
    const firstChip = chips.find((btn) =>
      btn.textContent?.includes("Groceries")
    );

    if (firstChip) {
      fireEvent.mouseEnter(firstChip);
      const acceptButton = screen.getAllByRole("button").find((btn) => {
        const svg = btn.querySelector("svg");
        return svg?.classList.contains("lucide-check");
      });

      if (acceptButton) {
        fireEvent.click(acceptButton);

        // Should show loading spinner
        await waitFor(() => {
          expect(screen.getByRole("status")).toBeInTheDocument();
        });
      }
    }
  });

  it("handles checkbox selection", () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(mockOnSelect).toHaveBeenCalledWith(999001, true);
  });

  it("handles edit button click", () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith(999001);
  });

  it("handles delete button click", () => {
    render(
      <table>
        <tbody>
          <TransactionRowWithSuggestions
            transaction={mockTransaction}
            suggestion={mockSuggestion}
            isSelected={false}
            onSelect={mockOnSelect}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onAcceptSuggestion={mockOnAcceptSuggestion}
            onRejectSuggestion={mockOnRejectSuggestion}
            suggestionsLoading={false}
          />
        </tbody>
      </table>
    );

    const deleteButton = screen.getByText("Delete");
    fireEvent.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith(999001);
  });
});
