import { PropsWithChildren } from "react";

type DevDockProps = PropsWithChildren<{ open: boolean }>;

export default function DevDock({ open, children }: DevDockProps) {
  if (!open) return null;
  return (
    <section id="dev-dock" className="panel p-4 mt-6">
      <div className="text-sm opacity-80 mb-2">Developer Tools</div>
      {children}
    </section>
  );
}
