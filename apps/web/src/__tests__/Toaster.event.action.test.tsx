import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Use global collectors to avoid TDZ issues with hoisted vi.mock
vi.mock("@/lib/toast-helpers", () => {
  (globalThis as any).__t_success_calls = [];
  (globalThis as any).__t_error_calls = [];
  return {
    toast: {
      success: (...a: any[]) => { (globalThis as any).__t_success_calls.push(a); },
      error: (...a: any[]) => { (globalThis as any).__t_error_calls.push(a); },
    }
  };
});

import { Toaster } from "@/components/ui/toast";

// Obsolete after toast refactor; retained only for historical reference.
describe.skip("Toaster — app:toast action object -> React element (obsolete)", () => {
  beforeEach(() => {
    (globalThis as any).__t_success_calls = [];
    (globalThis as any).__t_error_calls = [];
  });

  it("converts {label,onClick} to a React element and preserves click handler", async () => {
    render(<Toaster />);

    const onClick = vi.fn();
    const detail = {
      type: "success",
      message: "Seeded into Rule Tester",
      options: {
        action: { label: "Open tester", onClick },
        description: "Merchant & description copied — adjust and test.",
      },
    };

    window.dispatchEvent(new CustomEvent("app:toast", { detail }));

    const calls = (globalThis as any).__t_success_calls;
    expect(calls.length).toBe(1);
    const [msg, opts] = calls[0];
    expect(msg).toBe("Seeded into Rule Tester");
    expect(React.isValidElement(opts?.action)).toBe(true);
    expect(opts.action.props.children).toBe("Open tester");
    const ev: any = { preventDefault: vi.fn() };
    opts.action.props.onClick(ev);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ev.preventDefault).toHaveBeenCalled();
  });
});
