import React, { useState } from "react";
import { Dialog, DialogContent, DialogFooter } from "./ui/dialog";

type SuggestionsInfoSource = "unknowns" | "transactions";

interface SuggestionsInfoModalProps {
  source: SuggestionsInfoSource;
  triggerClassName?: string;
}

/**
 * Small helper to show what suggestions are, how they learn, and what data they use.
 * Used on both Unknowns card and Transactions drawer.
 */
export const SuggestionsInfoModal: React.FC<SuggestionsInfoModalProps> = ({
  source,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);

  const id = `lm-suggestions-info-${source}`;

  return (
    <>
      <button
        type="button"
        className={
          triggerClassName ??
          "text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 ml-2"
        }
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => setOpen(true)}
        data-testid={`suggestions-info-trigger-${source}`}
      >
        How suggestions work
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <div data-testid={`suggestions-info-modal-${source}`} id={id}>
          <DialogContent
            title="How suggestions work"
          >
            <div className="space-y-3 text-sm text-slate-200">
              <p>
                LedgerMind suggestions are generated from your past categories,
                common merchant patterns, and a small ML model. They&apos;re meant
                to save you time – you&apos;re always in control.
              </p>

              <ul className="list-disc list-inside space-y-1">
                <li>
                  When you <strong>accept</strong> a suggestion, we log that as
                  feedback and boost that category for similar merchants.
                </li>
                <li>
                  When you change or ignore a suggestion, we treat it as a soft
                  signal to avoid that category in the future.
                </li>
                <li>
                  Strong patterns are periodically promoted into{" "}
                  <strong>rules / hints</strong> so future transactions come in
                  pre-categorized.
                </li>
              </ul>

              <p>
                Suggestions don&apos;t connect to your bank directly and never
                move money – they only affect how transactions are{" "}
                <strong>labeled inside LedgerMind</strong>.
              </p>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </div>
      </Dialog>
    </>
  );
};
