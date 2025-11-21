import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplainSuggestionButton } from "../ExplainSuggestionButton";
import * as api from "../../lib/api";

describe("ExplainSuggestionButton", () => {
  it("renders trigger button with correct text", () => {
    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    const button = screen.getByRole("button", { name: /why this category/i });
    expect(button).toBeInTheDocument();
  });

  it("calls getExplain with the correct transaction id", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "getExplain").mockResolvedValue({
      rationale: "Because you often use this category for this merchant.",
      mode: "deterministic",
    } as any);

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    await user.click(
      screen.getByRole("button", { name: /why this category/i })
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(1456);
  });

  it("displays explanation text after loading", async () => {
    const user = userEvent.setup();
    const testExplanation = "This merchant is commonly categorized as subscriptions.software based on past transactions.";

    vi.spyOn(api, "getExplain").mockResolvedValue({
      rationale: testExplanation,
      mode: "deterministic",
    } as any);

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    await user.click(
      screen.getByRole("button", { name: /why this category/i })
    );

    // Wait for explanation to appear
    await waitFor(() => {
      expect(screen.getByText(testExplanation)).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching explanation", async () => {
    const user = userEvent.setup();

    // Create a promise we can control
    let resolveExplain: (value: any) => void;
    const explainPromise = new Promise((resolve) => {
      resolveExplain = resolve;
    });

    vi.spyOn(api, "getExplain").mockReturnValue(explainPromise as any);

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    await user.click(
      screen.getByRole("button", { name: /why this category/i })
    );

    // Should show loading text
    expect(screen.getByText(/loading explanation/i)).toBeInTheDocument();

    // Resolve the promise
    resolveExplain!({
      rationale: "Test explanation",
      mode: "deterministic",
    });

    // Wait for loading to disappear
    await waitFor(() => {
      expect(screen.queryByText(/loading explanation/i)).not.toBeInTheDocument();
    });
  });

  it("handles 404 errors gracefully", async () => {
    const user = userEvent.setup();

    const error404 = new Error("404 Not Found");
    (error404 as any).status = 404;

    vi.spyOn(api, "getExplain").mockRejectedValue(error404);

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    await user.click(
      screen.getByRole("button", { name: /why this category/i })
    );

    // Should show fallback message for 404
    await waitFor(() => {
      expect(screen.getByText(/explanation feature not available yet/i)).toBeInTheDocument();
    });
  });

  it("shows error message for non-404 errors", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(api, "getExplain").mockRejectedValue(new Error("Network error"));

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    await user.click(
      screen.getByRole("button", { name: /why this category/i })
    );

    // Should show generic error message
    await waitFor(() => {
      expect(screen.getByText(/could not load explanation/i)).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });

  it("toggles explanation popover open and closed", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "getExplain").mockResolvedValue({
      rationale: "Test explanation",
      mode: "deterministic",
    } as any);

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    const button = screen.getByRole("button", { name: /why this category/i });

    // Click to open
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByText("Test explanation")).toBeInTheDocument();
    });

    // Click again to close
    await user.click(button);
    await waitFor(() => {
      expect(screen.queryByText("Test explanation")).not.toBeInTheDocument();
    });
  });

  it("uses llm_rationale when available", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "getExplain").mockResolvedValue({
      llm_rationale: "LLM generated explanation",
      rationale: "Regular explanation",
      mode: "llm",
    } as any);

    render(<ExplainSuggestionButton txnId={1456} categorySlug="subscriptions.software" />);

    await user.click(
      screen.getByRole("button", { name: /why this category/i })
    );

    // Should prefer llm_rationale over rationale
    await waitFor(() => {
      expect(screen.getByText("LLM generated explanation")).toBeInTheDocument();
      expect(screen.queryByText("Regular explanation")).not.toBeInTheDocument();
    });
  });
});
