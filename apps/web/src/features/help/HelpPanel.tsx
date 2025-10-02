import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

type Props = {
  title: string;
  html: string;
  anchorRect: DOMRect;
};

let setStateRef: React.Dispatch<React.SetStateAction<Props | null>> | null = null;
export function openHelpPanel(p: Props) { setStateRef?.(p); }
export function closeHelpPanel() { setStateRef?.(null); }

export function HelpPanelHost() {
  const [p, setP] = useState<Props | null>(null);
  useEffect(() => { setStateRef = setP; return () => { setStateRef = null; }; }, []);
  if (!p) return null;

  const margin = 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = p.anchorRect.left + p.anchorRect.width / 2;
  let y = p.anchorRect.top - margin;
  let placeAbove = true;

  const estHeight = 180;
  if (y - estHeight < 0) { y = p.anchorRect.bottom + margin; placeAbove = false; }
  x = Math.min(vw - 20, Math.max(20, x));

  const node = (
    <div
      className="fixed z-[9900] pointer-events-auto"
      style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
    >
      <div className="max-w-[360px] w-[min(90vw,360px)] rounded-xl border border-white/10 bg-[rgb(26,28,33)] text-zinc-100 shadow-2xl ring-1 ring-white/10">
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm font-semibold">{p.title}</div>
          <button onClick={closeHelpPanel} className="text-xs opacity-80 hover:opacity-100">Close</button>
        </div>
        <div className="px-3 py-3 prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: p.html }} />
      </div>
      <div
        className="fixed z-[-1] h-3 w-3 rotate-45 bg-[rgb(26,28,33)] border border-white/10"
        style={{
          left: x,
          top: placeAbove ? (p.anchorRect.top - 2) : (p.anchorRect.bottom + 2),
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
  return ReactDOM.createPortal(node, document.body);
}
