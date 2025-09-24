import logoPng from "@/assets/ledgermind-logo.png";

export default function Brand() {
  return (
    <a
      href="/"
      aria-label="LedgerMind home"
      className="flex items-center gap-2 group"
    >
      <img
        src={logoPng}
        srcSet={`${logoPng} 1x, ${logoPng} 2x`}
        alt=""
        width={24}
        height={24}
        decoding="async"
        fetchPriority="high"
        className="h-6 w-6 rounded-[6px] ring-1 ring-white/10"
      />
      <span className="text-lg font-semibold tracking-tight text-zinc-100 group-hover:text-white">
        LedgerMind
      </span>
    </a>
  );
}
