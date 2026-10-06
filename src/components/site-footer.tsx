import Link from "next/link";
import { db } from "@/lib/db";
import { Logo } from "./logo";

const links = [
  { href: "/about", label: "About" },
  { href: "/stores", label: "Our stores" },
  { href: "/size-guide", label: "Size guide" },
  { href: "/condition-guide", label: "Condition grading" },
  { href: "/shipping", label: "Shipping" },
  { href: "/no-returns", label: "No-returns policy" },
  { href: "/terms", label: "Terms of sale" },
  { href: "/privacy", label: "Privacy" },
  { href: "/faq", label: "Contact & FAQ" },
  { href: "/orders", label: "Track an order" },
];

export async function SiteFooter() {
  const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
  return (
    <footer className="mt-24 bg-ink text-paper [--logo-bg:var(--color-ink)]">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-16 md:grid-cols-4 md:px-8">
        <div className="space-y-4">
          <Logo />
          <p className="text-sm text-ash">One piece. One owner. Yours next.</p>
          <p className="label text-ash">All sales final · Secure payment by Razorpay</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-2 md:col-span-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-ash hover:text-paper">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-6">
          {branches.map((b) => (
            <address key={b.id} className="not-italic text-sm text-ash">
              <span className="label block text-paper">{b.name}</span>
              {b.address}, {b.city} {b.pincode}
              <br />
              {b.hours}
            </address>
          ))}
          <div className="flex gap-4 text-sm">
            <a href="https://instagram.com/" className="underline underline-offset-4" rel="noopener">Instagram</a>
            <a href="https://wa.me/" className="underline underline-offset-4" rel="noopener">WhatsApp</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
