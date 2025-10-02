import lockup1024 from "@/assets/ledgermind-lockup-1024.png";

export default function Brand() {
  return (
    <a href="/" aria-label="LedgerMind home" className="flex items-center select-none">
      <div className="isolate pointer-events-auto">
        <img
          src={lockup1024}
          alt="LedgerMind"
          width={1024}
          height={1024}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          data-brand-logo
          className="block w-auto object-contain h-24 md:h-28 lg:h-32 xl:h-36 2xl:h-40 !filter-none !mix-blend-normal !opacity-100 translate-y-[1px]"
          style={{ filter: "none", mixBlendMode: "normal", opacity: 1 }}
        />
      </div>
    </a>
  );
}
