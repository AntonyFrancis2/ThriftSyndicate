// Announcement ticker (PRD §9.6). Motion stops with prefers-reduced-motion (globals.css).
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-charcoal bg-ink py-2 text-paper" aria-label={items.join(". ")}>
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap" aria-hidden>
        {[...row, ...row].map((t, i) => (
          <span key={i} className="label">
            {t} <span className="mx-6 text-steel">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
