import React from "react";

type Props = { size?: number; label?: string; className?: string };

export default function RobotThinking({ size = 64, label = "Thinking…", className = "" }: Props) {
  const s = size, r = s / 2;
  const eyeY = s * 0.42, eyeX = s * 0.18, eyeR = Math.max(2, s * 0.06);
  const mouthW = s * 0.34, mouthH = s * 0.18, mouthX = r - mouthW / 2, mouthY = s * 0.60;

  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite" aria-label={label} title={label}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="robot-animate-float">
        <defs>
          <radialGradient id="rg" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="60%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* head */}
        <rect x={s*0.12} y={s*0.14} width={s*0.76} height={s*0.70} rx={s*0.16} fill="url(#rg)"
              stroke="rgba(255,255,255,.12)" strokeWidth={1} />

        {/* antenna */}
        <line x1={r} y1={s*0.06} x2={r} y2={s*0.14} stroke="rgba(255,255,255,.6)" strokeWidth={2}/>
        <circle cx={r} cy={s*0.06} r={s*0.035} className="robot-animate-glow" fill="#93c5fd" filter="url(#glow)"/>

        {/* eyes */}
        <g fill="#0ea5e9" filter="url(#glow)">
          <circle cx={r - eyeX} cy={eyeY} r={eyeR} className="robot-animate-blink"/>
          <circle cx={r + eyeX} cy={eyeY} r={eyeR} className="robot-animate-blink" style={{ animationDelay: "0.05s" } as any}/>
        </g>

        {/* mouth equalizer */}
        <g transform={`translate(${mouthX}, ${mouthY})`}>
          <rect width={mouthW} height={mouthH} rx={mouthH*0.35} fill="rgba(15,23,42,.5)" />
          <g transform={`translate(${mouthW*0.10}, ${mouthH*0.15})`}>
            <rect width={mouthW*0.18} height={mouthH*0.7} className="robot-animate-mouth"  fill="#a78bfa"/>
            <rect x={mouthW*0.26} width={mouthW*0.18} height={mouthH*0.7} className="robot-animate-mouth2" fill="#60a5fa"/>
            <rect x={mouthW*0.52} width={mouthW*0.18} height={mouthH*0.7} className="robot-animate-mouth3" fill="#34d399"/>
          </g>
        </g>

        {/* shadow */}
        <ellipse cx={r} cy={s*0.88} rx={s*0.28} ry={s*0.06} fill="rgba(0,0,0,.35)"/>
      </svg>
    </div>
  );
}
