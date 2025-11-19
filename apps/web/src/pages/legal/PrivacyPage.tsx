import React from "react";

/**
 * PrivacyPage: Privacy policy for LedgerMind
 */
export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Privacy Policy</h1>
        <p className="text-sm text-slate-300 mb-4">
          LedgerMind is currently in a limited beta. We collect only the data
          needed to provide the service: your Google account identity and any
          transaction files you choose to upload.
        </p>
        <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
          <li>We use Google sign-in; LedgerMind never sees your Google password.</li>
          <li>Your statements are stored securely and used only to power your own charts and insights.</li>
          <li>You can request deletion of your data by contacting support.</li>
          <li>We do not sell or share your financial data with third parties.</li>
          <li>Transaction data is encrypted at rest using cloud key management.</li>
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

export default PrivacyPage;
