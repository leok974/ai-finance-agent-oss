import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuggestionsInfoModal } from "../SuggestionsInfoModal";

describe("SuggestionsInfoModal", () => {
  it("renders trigger button with correct text", () => {
    render(<SuggestionsInfoModal source="unknowns" />);

    const trigger = screen.getByTestId("suggestions-info-trigger-unknowns");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("How suggestions work");
  });

  it("opens and closes when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<SuggestionsInfoModal source="unknowns" />);

    const trigger = screen.getByTestId("suggestions-info-trigger-unknowns");

    // Modal should not be visible initially
    expect(
      screen.queryByTestId("suggestions-info-modal-unknowns")
    ).not.toBeInTheDocument();

    // Click trigger to open modal
    await user.click(trigger);

    // Modal should now be visible
    const modal = await screen.findByTestId(
      "suggestions-info-modal-unknowns"
    );
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent("How suggestions work");

    // Close via close button
    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    // Modal should be hidden again
    expect(
      screen.queryByTestId("suggestions-info-modal-unknowns")
    ).not.toBeInTheDocument();
  });

  it("shows correct content about ML suggestions", async () => {
    const user = userEvent.setup();
    render(<SuggestionsInfoModal source="transactions" />);

    await user.click(screen.getByTestId("suggestions-info-trigger-transactions"));

    const modal = await screen.findByTestId("suggestions-info-modal-transactions");

    // Check for key content
    expect(modal).toHaveTextContent("LedgerMind suggestions are generated");
    expect(modal).toHaveTextContent("accept");
    expect(modal).toHaveTextContent("rules / hints");
    expect(modal).toHaveTextContent("labeled inside LedgerMind");
  });

  it("uses custom className when provided", () => {
    const customClass = "custom-test-class";
    render(
      <SuggestionsInfoModal
        source="unknowns"
        triggerClassName={customClass}
      />
    );

    const trigger = screen.getByTestId("suggestions-info-trigger-unknowns");
    expect(trigger).toHaveClass(customClass);
  });

  it("applies default className when not provided", () => {
    render(<SuggestionsInfoModal source="unknowns" />);

    const trigger = screen.getByTestId("suggestions-info-trigger-unknowns");
    expect(trigger.className).toContain("text-xs");
    expect(trigger.className).toContain("underline");
  });
});
