import lockupPng from "@/assets/ledgermind-lockup.png";

export default function Brand() {
  return (
    <a
      href="/"
      aria-label="LedgerMind home"
      className="flex items-center select-none"
    >
      <img
        src={lockupPng}
        alt="LedgerMind"
        width={1024}
        height={1024}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        className="block w-auto h-16 md:h-20 lg:h-24 xl:h-28 object-contain brightness-100 contrast-100 saturate-100 select-none"
        style={{ imageRendering: "auto" }}
      />
    </a>
  );
}
