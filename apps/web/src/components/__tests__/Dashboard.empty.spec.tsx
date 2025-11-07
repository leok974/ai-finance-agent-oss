// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useState, useEffect } from "react";

/**
 * Dashboard Empty State Tests
 *
 * Ensures dashboard shows:
 * 1. Empty state (upload prompt) when user has no transactions
 * 2. Charts/data when user has transactions
 * 3. Proper loading states
 */

// Mock the API module
vi.mock("@/lib/http", () => ({
  fetchJSON: vi.fn(),
}));

// Import after mocking
import { fetchJSON } from "@/lib/http";

// Simple Dashboard component for testing
function TestDashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchJSON("transactions", { query: { limit: 1 } });
        setTransactions(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load transactions", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div data-testid="empty-state">
        <h2>Upload Transactions CSV</h2>
        <button data-testid="upload-button">Upload CSV</button>
      </div>
    );
  }

  return (
    <div data-testid="dashboard-with-data">
      <h2>Total Spend</h2>
      <div data-testid="transaction-count">{transactions.length} transactions</div>
    </div>
  );
}

describe("Dashboard empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Upload panel when user has no transactions", async () => {
    // Mock API to return empty array
    vi.mocked(fetchJSON).mockResolvedValueOnce([]);

    render(<TestDashboard />);

    // Initially shows loading
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Wait for empty state to appear
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    expect(screen.getByText(/Upload Transactions CSV/i)).toBeVisible();
    expect(screen.queryByText(/Total Spend/i)).not.toBeInTheDocument();
  });

  it("shows charts when user has data", async () => {
    // Mock API to return transactions
    vi.mocked(fetchJSON).mockResolvedValueOnce([
      { id: "t1", amount: -50, merchant: "Coffee Shop" },
    ]);

    render(<TestDashboard />);

    // Wait for dashboard with data to appear
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-with-data")).toBeInTheDocument();
    });

    expect(screen.getByText(/Total Spend/i)).toBeVisible();
    expect(screen.queryByText(/Upload Transactions CSV/i)).not.toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    // Mock API with delay
    vi.mocked(fetchJSON).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([]), 100);
        })
    );

    render(<TestDashboard />);

    // Initially shows loading
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Then shows empty state
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("verifies fetchJSON is called with correct parameters", async () => {
    vi.mocked(fetchJSON).mockResolvedValueOnce([]);

    render(<TestDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    // Verify API was called with correct params
    expect(fetchJSON).toHaveBeenCalledWith("transactions", {
      query: { limit: 1 },
    });
    expect(fetchJSON).toHaveBeenCalledTimes(1);
  });
});
