import React from "react";

/**
 * SecurityPage: Security documentation for LedgerMind
 */
export function SecurityPage() {
  return (
    <div className="min-h-screen bg-black text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Security</h1>
        <p className="text-sm text-slate-300 mb-4">
          LedgerMind is built with a security-first architecture:
        </p>
        <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
          <li>Google sign-in only; we never store your Google password.</li>
          <li>All traffic is encrypted over HTTPS/TLS.</li>
          <li>Transaction data is stored encrypted at rest in our database (backed by cloud key management).</li>
          <li>We do not connect directly to your bank; you control which files you upload.</li>
          <li>Sessions are secured with httpOnly cookies and CSRF protection.</li>
          <li>Regular security updates and monitoring for vulnerabilities.</li>
        </ul>
        <div className="mt-6 p-4 border border-slate-800 rounded-lg bg-slate-950/40">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Responsible Disclosure</h2>
          <p className="text-xs text-slate-300">
            If you discover a security vulnerability, please contact us immediately.
            We appreciate responsible disclosure and will work with you to address any issues.
          </p>
        </div>
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

export default SecurityPage;
