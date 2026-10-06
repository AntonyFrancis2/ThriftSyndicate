// Working version of "The Syndicate Tag" (PRD §10.2): a price-tag monogram beside a stacked wordmark.
// A placeholder until the designer delivers final artwork.
export function Monogram({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2h48a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H12L2 20 12 2Z" />
      <circle cx="12" cy="20" r="3.2" className="fill-[var(--logo-bg,#fff)]" />
      <text
        x="39"
        y="30"
        textAnchor="middle"
        fontSize="26"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.5px" }}
        className="fill-[var(--logo-bg,#fff)]"
      >
        TS
      </text>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Monogram className="h-7 w-auto" />
      <span className="display flex flex-col text-[15px] leading-[0.9] tracking-[0.02em]">
        <span className="tracking-[0.23em]">Thrift</span>
        <span>Syndicate</span>
      </span>
      <span className="sr-only">ThriftSyndicate home</span>
    </span>
  );
}
