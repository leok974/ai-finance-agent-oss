import React from "react";
import AuthMenu from "@/components/AuthMenu";
import logoPng from "@/assets/ledgermind-lockup-1024.png";

/**
 * LandingHero: Full hero page shown to unauthenticated users
 *
 * Features:
 * - Hero copy with value proposition
 * - Feature bullets
 * - Google sign-in CTA (via AuthMenu)
 * - Static product preview card
 */
export default function LandingHero() {
  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col" data-testid="landing-hero">
      {/* Centered content with max-width */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-6xl grid gap-10 lg:grid-cols-2 items-center">
          {/* Left: Logo + Copy + CTA */}
          <div className="space-y-6">
            {/* Logo + Brand */}
            <div className="mb-6">
              <img
                src={logoPng}
                alt="LedgerMind"
                className="h-12 sm:h-14 w-auto select-none"
                draggable={false}
              />
            </div>

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>AI-powered transaction clarity</span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
              See where your money{" "}
              <span className="text-emerald-400">really</span> goes.
            </h1>

            {/* Supporting paragraph */}
            <p className="text-slate-300 max-w-xl text-base sm:text-lg leading-relaxed">
              LedgerMind cleans up messy bank descriptions, surfaces subscriptions and
              transfers, and lets you chat with your spending like it&apos;s a teammate.
            </p>

            {/* Feature bullets */}
            <ul className="space-y-3 text-sm sm:text-base text-slate-300">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                <span>Automatic merchant cleanup &amp; P2P / transfer detection.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                <span>Top merchants and category insights for every month.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                <span>ChatDock: ask questions like &quot;Why was October so expensive?&quot;</span>
              </li>
            </ul>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              {/* Reuse existing Google sign-in button */}
              <AuthMenu />

              <p className="text-xs text-slate-400">
                Sign in with Google to get started in under a minute.
              </p>
            </div>
          </div>

          {/* Right: Product preview card */}
          <div className="relative">
            {/* Glow effect */}
            <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-tr from-emerald-500/40 via-sky-500/10 to-transparent blur-3xl" />

            {/* Card */}
            <div className="relative rounded-3xl border border-slate-800 bg-slate-950/80 p-5 sm:p-6 shadow-xl shadow-emerald-500/10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  November overview
                </span>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                  Sample data
                </span>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl bg-slate-900/70 p-3">
                  <div className="text-slate-400">Income</div>
                  <div className="mt-1 text-sm font-semibold text-emerald-400">$4,230</div>
                </div>
                <div className="rounded-xl bg-slate-900/70 p-3">
                  <div className="text-slate-400">Spend</div>
                  <div className="mt-1 text-sm font-semibold text-rose-400">$3,180</div>
                </div>
                <div className="rounded-xl bg-slate-900/70 p-3">
                  <div className="text-slate-400">Net</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">$1,050</div>
                </div>
              </div>

              {/* Mini "chart" */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Top merchants</span>
                  <span>Nov · sample</span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Groceries · FreshMart", value: 80 },
                    { name: "Subscriptions · Streamly", value: 45 },
                    { name: "Dining · Neighborhood Cafe", value: 30 },
                  ].map((m) => (
                    <div key={m.name} className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                          style={{ width: `${m.value}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-300 whitespace-nowrap min-w-[140px] sm:min-w-[180px]">
                        {m.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Optional tiny footer */}
      <footer className="py-6 text-center text-xs text-slate-500">
        <p>Personal finance tracking with AI-powered insights</p>
      </footer>
    </div>
  );
}
