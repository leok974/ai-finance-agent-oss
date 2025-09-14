import * as React from "react";
import HelpBadge from "./HelpBadge";

type Props = {
  title: React.ReactNode | string;
  helpKey?: string;
  month?: string;
  actions?: React.ReactNode;
  className?: string;
};

export default function CardHeaderRow({ title, helpKey, month, actions, className = "mb-2" }: Props) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h3 className="text-base font-semibold flex items-center">
        {title}
        {helpKey ? <HelpBadge k={helpKey} month={month} className="ml-2" /> : null}
      </h3>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
