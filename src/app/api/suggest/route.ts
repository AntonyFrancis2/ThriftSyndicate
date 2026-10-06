import { db } from "@/lib/db";
import { interpretQuery } from "@/lib/catalog";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

// Search-as-you-type suggestions: products, brands and teams (PRD §6.3).
export async function GET(req: Request) {
  if (!rateLimit(`suggest:${clientIp(req)}`, 60, 60_000)) return Response.json({ products: [], terms: [] });
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase().slice(0, 60) ?? "";
  if (q.length < 2) return Response.json({ products: [], terms: [] });
  const { text } = interpretQuery(q);
  const needle = text || q;

  const products = await db.$queryRaw<{ slug: string; title: string; brand: string; team: string | null }[]>`
    SELECT slug, title, brand, team FROM "Product"
    WHERE status = 'PUBLISHED'
      AND (word_similarity(${needle}, lower(title || ' ' || brand || ' ' || coalesce(team, ''))) > 0.4
           OR lower(title || ' ' || brand || ' ' || coalesce(team, '')) LIKE ${"%" + needle + "%"})
    ORDER BY word_similarity(${needle}, lower(title || ' ' || brand || ' ' || coalesce(team, ''))) DESC
    LIMIT 6`;

  const terms = new Map<string, { label: string; href: string }>();
  for (const p of products) {
    if (p.team && p.team.toLowerCase().includes(needle.slice(0, 3))) terms.set(`team:${p.team}`, { label: p.team, href: `/shop?team=${encodeURIComponent(p.team)}` });
    if (p.brand.toLowerCase().includes(needle.slice(0, 3))) terms.set(`brand:${p.brand}`, { label: p.brand, href: `/shop?brand=${encodeURIComponent(p.brand)}` });
  }
  return Response.json({
    products: products.map((p) => ({ label: p.title, href: `/product/${p.slug}` })),
    terms: [...terms.values()].slice(0, 4),
  });
}
