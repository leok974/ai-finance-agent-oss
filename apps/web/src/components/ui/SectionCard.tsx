import { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: Props) {
  return (
    <section
      className={
        // match the styling used by your transaction cards
        "rounded-2xl border border-white/10 bg-white/[0.02] " +
        "shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] p-4 md:p-5 " +
        className
      }
    >
      {(title || subtitle || actions) && (
        <header className="mb-3 flex items-center justify-between">
          <div>
            {subtitle && (
              <div className="text-xs uppercase tracking-wide text-white/45">
                {subtitle}
              </div>
            )}
            {title && (
              <h3 className="mt-0.5 text-sm font-medium text-white">
                {title}
              </h3>
            )}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
