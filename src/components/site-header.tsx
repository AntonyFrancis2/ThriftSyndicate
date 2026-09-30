"use client";

import { Menu, Search, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBag } from "@/lib/bag-store";
import { Logo } from "./logo";
import { SearchBox } from "./search-box";

const nav = [
  { href: "/shop?era=retro", label: "Retro" },
  { href: "/shop?era=latest", label: "Latest" },
  { href: "/shop?category=t-shirts", label: "T-shirts" },
  { href: "/shop?category=jeans", label: "Jeans" },
  { href: "/shop?category=jerseys", label: "Jerseys" },
  { href: "/stores", label: "Our stores" },
];

// Logo centred, menu left, search and bag right; turns solid black on scroll (PRD §9.4).
export function SiteHeader() {
  const lines = useBag();
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dark = scrolled || menuOpen;

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-200 ${dark ? "bg-ink text-paper [--logo-bg:#0a0a0a]" : "border-b border-mist bg-paper text-ink [--logo-bg:#fff]"}`}
    >
      <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-4 md:px-8">
        <div className="flex items-center gap-6">
          <button className="p-2 -ml-2 lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
            {menuOpen ? <X className="size-6" strokeWidth={1.5} /> : <Menu className="size-6" strokeWidth={1.5} />}
          </button>
          <nav className="hidden gap-5 lg:flex" aria-label="Main">
            {nav.slice(0, 5).map((n) => (
              <Link key={n.href} href={n.href} className="label hover:underline underline-offset-4">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/" aria-label="ThriftSyndicate home">
          <Logo />
        </Link>
        <div className="flex items-center justify-end gap-1">
          <button className="p-2" onClick={() => setSearchOpen((o) => !o)} aria-label="Search">
            <Search className="size-5" strokeWidth={1.5} />
          </button>
          <Link href="/bag" className="relative p-2" aria-label={`Bag, ${count} item${count === 1 ? "" : "s"}`}>
            <ShoppingBag className="size-5" strokeWidth={1.5} />
            {count > 0 && (
              <span className={`label absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full text-[10px] ${dark ? "bg-paper text-ink" : "bg-ink text-paper"}`}>
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
      {menuOpen && (
        <nav className="border-t border-charcoal px-4 pb-6 lg:hidden" aria-label="Mobile">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="display block py-3 text-3xl">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
      {searchOpen && <SearchBox onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
