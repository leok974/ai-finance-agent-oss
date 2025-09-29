import * as React from "react";
import CardHelpTooltip from "./CardHelpTooltip";

type Props = {
  title: React.ReactNode | string;
  helpKey?: string; // maps to cardId
  month?: string;
  actions?: React.ReactNode;
  className?: string;
  helpCtx?: any; // deterministic context object for the card
  helpBaseText?: string; // base summary for why mode
};

export default function CardHeaderRow({ title, helpKey, month, actions, className = "mb-2", helpCtx, helpBaseText }: Props) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h3 className="text-base font-semibold flex items-center">
        {title}
        {helpKey ? (
          <CardHelpTooltip
            cardId={helpKey}
            month={month}
            ctx={helpCtx || {}}
            baseText={helpBaseText || null}
            className="ml-2"
          />
        ) : null}
      </h3>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
