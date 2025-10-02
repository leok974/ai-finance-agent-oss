import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// --- Stable UUID so we can assert/avoid randomness ---
beforeAll(() => {
  const target: any = globalThis as any;
  if (target.crypto && typeof target.crypto.randomUUID === 'function') {
    vi.spyOn(target.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  } else {
    Object.defineProperty(target, 'crypto', { value: { randomUUID: () => '00000000-0000-4000-8000-000000000000' }, configurable: true });
  }
});

// --- MOCK: schemas parse (bypass validation) ---
// Important: this mock must be hoisted before SaveRuleModal import
vi.mock("@/lib/schemas", () => ({
  ThresholdsSchema: {
    parse: (obj: any) => obj, // permissive passthrough
  },
}));

// --- MOCK: saveRule capture (define inside factory to avoid TDZ) ---
vi.mock("@/lib/api", () => {
  const saveRuleSpy = vi.fn(async () => ({
    ok: true,
    id: "r-123",
    display_name: "Auto: cut groceries 20%",
    source: "json",
    idempotency_reused: false,
    ack: "[ack] rules.save: ok (1)",
  }));
  return { saveRule: saveRuleSpy, __saveRuleSpy: saveRuleSpy };
});

// --- MOCK: hush toasts ---
vi.mock("@/lib/toast-helpers", () => {
  const success = vi.fn();
  const error = vi.fn();
  return {
    showToast: success,
    emitToastSuccess: success,
    emitToastError: error,
    toast: { success, error },
    useOkErrToast: () => ({ ok: success, err: error })
  };
});

// Import after mocks so ESM hoist doesn’t beat us
import SaveRuleModal from "@/components/SaveRuleModal";
import * as apiModule from "@/lib/api";

describe("SaveRuleModal — isolated submit flow", () => {
  it("submits with thresholds + category + scenario and calls saveRule once", async () => {
    const Wrapper = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <SaveRuleModal
          open={open}
          onOpenChange={setOpen}
          month="2025-08"
          scenario="cut groceries 20%"
          defaultCategory="Groceries"
        />
      );
    };

  const { container } = render(<Wrapper />);
  const saveRuleSpy = (apiModule as any).__saveRuleSpy as ReturnType<typeof vi.fn>;
  saveRuleSpy.mockClear();
    const user = userEvent.setup();

    // Fill/adjust fields
    const nameInput = await screen.findByLabelText(/rule name/i);
    await user.clear(nameInput);
  await user.clear(nameInput as HTMLInputElement);
  await user.type(nameInput as HTMLInputElement, "Auto: cut groceries 20%");

    const categoryInput = screen.getByLabelText(/category/i) as HTMLInputElement;
    await user.clear(categoryInput);
    await user.type(categoryInput, "Groceries");

    const minConf = screen.getByLabelText(/min confidence/i) as HTMLInputElement;
    await user.clear(minConf);
    await user.type(minConf, "0.7");

    const budgetPct = screen.getByLabelText(/budget %/i) as HTMLInputElement;
    await user.clear(budgetPct);
    await user.type(budgetPct, "25");

    const limit = screen.getByLabelText(/limit/i) as HTMLInputElement;
    await user.clear(limit);
    await user.type(limit, "200");

    // Click submit first (normal path)
    const submitBtn = screen.getByRole("button", { name: /save rule/i });
    await user.click(submitBtn);

    // Fallback: explicitly dispatch submit if click doesn’t propagate in happy-dom
  if (!saveRuleSpy.mock.calls.length) {
      const form = container.querySelector("form");
      expect(form).toBeTruthy();
      if (form) {
        fireEvent.submit(form);
      }
      // flush queued microtasks
      await Promise.resolve();
      await Promise.resolve();
    }

    await waitFor(() => expect(saveRuleSpy).toHaveBeenCalledTimes(1));

    // Assert payload shape
  const call = saveRuleSpy.mock.calls[0] as any[];
  const payload = call?.[0];
  const opts = call?.[1];
    expect(payload).toMatchObject({
      month: "2025-08",
      rule: {
        name: "Auto: cut groceries 20%",
        when: {
          scenario: "cut groceries 20%",
          thresholds: {
            minConfidence: 0.7,
            budgetPercent: 25,
            limit: 200,
          },
          category: "Groceries",
        },
        then: { category: "Groceries" },
      },
    });
    // Idempotency header provided
    expect(opts?.idempotencyKey).toBe("00000000-0000-4000-8000-000000000000");
  });
});
