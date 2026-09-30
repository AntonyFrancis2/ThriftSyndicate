import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ProductCard } from "@/components/product-card";
import { newestProducts } from "@/lib/catalog";
import { db } from "@/lib/db";

// Film-grain overlay for the hero (PRD §9.5).
const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E\")";

// Curated collections; the super admin will manage these from the admin panel (PRD §7.7).
const collections = [
  { label: "90s football", href: "/shop?category=jerseys&era=retro&decade=1990", note: "Umbro, Adidas, Nike" },
  { label: "Selvedge denim", href: "/shop?category=jeans&era=retro", note: "Levi's, Lee, Momotaro" },
  { label: "Band tees", href: "/shop?category=t-shirts&era=retro", note: "Single stitch, tour dates" },
];

export default async function HomePage() {
  await connection();
  const [justLanded, branches] = await Promise.all([newestProducts(12), db.branch.findMany({ orderBy: { name: "asc" } })]);

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-paper">
        <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ backgroundImage: grain }} aria-hidden />
        <div className="relative mx-auto flex min-h-[72vh] max-w-[1440px] flex-col justify-end px-4 pb-12 pt-24 md:px-8 md:pb-20">
          <p className="label mb-6 text-ash">Drop 001 · Retro & latest · Tees, jeans, jerseys</p>
          <h1 className="display max-w-5xl text-[64px] md:text-[120px]">One piece. One owner. Yours next.</h1>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/shop" className="btn bg-paper text-ink hover:bg-mist">
              Shop the drop <ArrowRight className="size-4" strokeWidth={1.5} />
            </Link>
            <Link href="/shop?era=retro" className="btn border border-paper text-paper hover:bg-paper hover:text-ink">
              Browse retro
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-mist" aria-label="Why ThriftSyndicate">
        <ul className="label mx-auto grid max-w-[1440px] gap-3 px-4 py-5 text-graphite md:grid-cols-3 md:px-8">
          <li>Every piece photographed in-house</li>
          <li className="md:text-center">Secure payment by Razorpay</li>
          <li className="md:text-right">Ships from our 2 stores</li>
        </ul>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-3 px-4 pt-12 md:grid-cols-2 md:gap-6 md:px-8">
        {[
          { label: "Retro", sub: "Vintage and pre-owned, 70s to 10s", href: "/shop?era=retro", dark: true },
          { label: "Latest", sub: "This season's fits at thrift prices", href: "/shop?era=latest", dark: false },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`group flex aspect-[16/10] flex-col justify-between p-6 md:p-10 ${t.dark ? "bg-ink text-paper" : "bg-bone text-ink"}`}
          >
            <span className="label">{t.sub}</span>
            <span className="display flex items-end justify-between text-7xl md:text-9xl">
              {t.label}
              <ArrowRight className="mb-3 size-8 transition-transform group-hover:translate-x-1" strokeWidth={1.5} />
            </span>
          </Link>
        ))}
      </section>

      <section className="mx-auto grid max-w-[1440px] grid-cols-3 gap-3 px-4 pt-3 md:gap-6 md:px-8 md:pt-6">
        {[
          { label: "T-shirts", href: "/shop?category=t-shirts" },
          { label: "Jeans", href: "/shop?category=jeans" },
          { label: "Jerseys", href: "/shop?category=jerseys" },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="display flex aspect-square items-end border border-ink p-4 text-2xl hover:bg-ink hover:text-paper md:p-8 md:text-5xl">
            {c.label}
          </Link>
        ))}
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pt-20 md:px-8">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="display text-5xl md:text-7xl">Just landed</h2>
          <Link href="/shop" className="label underline underline-offset-4">View all</Link>
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:gap-6 md:px-8">
          {justLanded.map((p, i) => (
            <div key={p.id} className="w-[46%] shrink-0 snap-start md:w-[23%]">
              <ProductCard product={p} priority={i < 4} />
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pt-20 md:px-8">
        <h2 className="display mb-6 text-5xl md:text-7xl">Collections</h2>
        <div className="grid gap-3 md:grid-cols-3 md:gap-6">
          {collections.map((c, i) => (
            <Link key={c.label} href={c.href} className="group flex min-h-48 flex-col justify-between bg-bone p-6 hover:bg-ink hover:text-paper">
              <span className="label text-steel group-hover:text-ash">No. {String(i + 1).padStart(3, "0")}</span>
              <span>
                <span className="display block text-4xl">{c.label}</span>
                <span className="text-sm">{c.note}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pt-20 md:px-8">
        <h2 className="display mb-6 text-5xl md:text-7xl">Our stores</h2>
        <div className="grid gap-3 md:grid-cols-2 md:gap-6">
          {branches.map((b) => (
            <div key={b.id} className="border border-mist p-6">
              <h3 className="display text-3xl">{b.name}</h3>
              <p className="mt-2 text-graphite">
                {b.address}, {b.city} {b.pincode}
              </p>
              <p className="label mt-2 text-steel">{b.hours}</p>
              {b.mapUrl && (
                <a href={b.mapUrl} className="label mt-4 inline-block underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  Open in Maps
                </a>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
