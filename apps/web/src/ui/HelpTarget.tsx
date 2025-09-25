import React from "react";
import type { HelpKey } from "../help/helpRegistry";

type Props = React.HTMLAttributes<HTMLElement> & { helpKey: HelpKey; as?: keyof JSX.IntrinsicElements };

export default function HelpTarget({ helpKey, as = "div", children, ...rest }: Props) {
  const Tag = as as any;
  return (
    <Tag data-help-key={helpKey} data-help="1" {...rest}>
      {children}
    </Tag>
  );
}
