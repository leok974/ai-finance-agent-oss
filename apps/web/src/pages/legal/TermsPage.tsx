import React from "react";

/**
 * TermsPage: Terms of use for LedgerMind
 */
export function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Terms of Use</h1>
        <p className="text-sm text-slate-300 mb-4">
          LedgerMind is provided &quot;as is&quot; during this beta period. It is a personal finance insights
          tool and does not provide financial, tax, or investment advice.
        </p>
        <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
          <li>You are responsible for decisions you make based on insights shown in LedgerMind.</li>
          <li>Do not upload sensitive data unrelated to your transactions.</li>
          <li>We may change or discontinue the service during the beta.</li>
          <li>You retain ownership of all transaction data you upload.</li>
          <li>We reserve the right to terminate accounts that violate these terms.</li>
        </ul>
        <div className="mt-6 text-xs text-slate-400">
          Last updated: November 2025
        </div>
        <div className="mt-6">
          <a
            href="/"
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            ← Back to LedgerMind
          </a>
        </div>
      </div>
    </div>
  );
}

export default TermsPage;
