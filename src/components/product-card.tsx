import Link from "next/link";
import { conditionLabel } from "@/lib/catalog";
import type { ProductCardData } from "@/lib/catalog";
import { formatINR } from "@/lib/money";
import { photoUrl } from "@/lib/photo-url";

// Image on a Bone backdrop at 4:5, monospace era tag top-left, second photo on hover (PRD §6.2, §9.4).
export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const [first, second] = product.images;
  const sizes = product.variants.filter((v) => v.stockQty > 0).map((v) => v.size);
  const eraTag = product.era === "RETRO" ? `Retro${product.decade ? ` / ${product.decade}s` : ""}` : "Latest";
  const sold = product.availability === "sold";

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-bone">
        {first && (
          // eslint-disable-next-line @next/next/no-img-element -- swapped for a CDN image component with Cloudinary
          <img src={photoUrl(first.url, 640)} alt={first.altText} loading={priority ? "eager" : "lazy"} className="absolute inset-0 size-full object-cover" />
        )}
        {second && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(second.url, 640)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        )}
        <span className="tag absolute left-3 top-3 bg-paper text-ink">{eraTag}</span>
        {product.availability === "on_hold" && <span className="tag absolute right-3 top-3 border-primary bg-primary text-paper">On hold</span>}
        {sold && (
          <span className="absolute inset-0 grid place-items-center bg-paper/60">
            <span className="display -rotate-6 border-2 border-signal px-4 py-1 text-3xl text-signal">Sold</span>
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium leading-snug group-hover:underline underline-offset-4">{product.title}</h3>
          <span className="label shrink-0">{formatINR(product.pricePaise)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-steel">
          <span className="label">{sold ? "Sold" : `Size ${sizes.join(" · ") || "—"}`}</span>
          <span className="tag text-graphite">{conditionLabel[product.condition]}</span>
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:gap-x-6 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 4} />
      ))}
    </div>
  );
}
