import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToBag } from "@/components/add-to-bag";
import { DeliveryEstimate } from "@/components/delivery-estimate";
import { ProductGrid } from "@/components/product-card";
import { categoryLabel, categorySlug, conditionLabel, conditionMeaning, getProductBySlug, relatedProducts } from "@/lib/catalog";
import { formatINR } from "@/lib/money";

const measurementLabels: Record<string, string> = {
  chest: "Chest (pit to pit)",
  length: "Length",
  shoulder: "Shoulder",
  waist: "Waist",
  inseam: "Inseam",
  rise: "Rise",
  legOpening: "Leg opening",
};

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return {};
  return {
    title: product.title,
    description: `${product.title} — ${conditionLabel[product.condition]}, ${formatINR(product.pricePaise)}. ${product.description}`,
    openGraph: { images: product.images[0] ? [product.images[0].url] : [] },
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  const related = await relatedProducts(product);
  const measurements = Object.entries(product.measurements as Record<string, number>);
  const isRetro = product.era === "RETRO";

  const details: [string, string | null | undefined][] = [
    ["Brand", product.brand],
    ["Era", isRetro ? `Retro${product.decade ? ` · ${product.decade}s` : ""}` : "Latest season"],
    ["Size on tag", product.variants.map((v) => v.size).join(", ")],
    ["Team", product.team],
    ["Season", product.season],
    ["Kit", product.kitType],
    ["Authenticity", product.authenticity],
    ["Player print", product.playerPrint],
    ["Material", product.material],
    ["Colour", product.colour],
    ["SKU", product.sku],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand },
    image: product.images.map((i) => i.url),
    itemCondition: product.condition === "NEW" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: (product.pricePaise / 100).toFixed(2),
      availability: product.availability === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    },
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="label mb-6 text-steel" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:underline">Shop</Link> /{" "}
        <Link href={`/shop?category=${categorySlug[product.category]}`} className="hover:underline">{categoryLabel[product.category]}</Link> /{" "}
        <Link href={`/shop?category=${categorySlug[product.category]}&era=${product.era.toLowerCase()}`} className="hover:underline">{isRetro ? "Retro" : "Latest"}</Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto md:mx-0 md:grid md:grid-cols-2 md:overflow-visible">
          {product.images.map((img, i) => (
            <figure key={img.id} className="relative aspect-[4/5] w-[88%] shrink-0 snap-center bg-bone md:w-auto">
              {/* eslint-disable-next-line @next/next/no-img-element -- swapped for a CDN image component with Cloudinary */}
              <img src={img.url} alt={img.altText} loading={i < 2 ? "eager" : "lazy"} className="size-full object-cover" />
            </figure>
          ))}
        </div>

        <div className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="label text-steel">{product.sku} · {isRetro ? `Retro${product.decade ? ` / ${product.decade}` : ""}` : "Latest"}</p>
            <h1 className="display mt-2 text-4xl md:text-6xl">{product.title}</h1>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="text-2xl font-medium">{formatINR(product.pricePaise)}</span>
              {product.compareAtPaise && <span className="text-steel line-through">{formatINR(product.compareAtPaise)}</span>}
              <span className="label text-steel">incl. GST</span>
            </p>
          </div>

          <AddToBag
            availability={product.availability}
            variants={product.variants.map((v) => ({ id: v.id, size: v.size, free: product.freeVariantIds.includes(v.id) }))}
          />

          <section className="border border-ink p-4">
            <div className="flex items-center gap-3">
              <span className="tag">{conditionLabel[product.condition]}</span>
              <span className="text-sm">{conditionMeaning[product.condition]}</span>
            </div>
            {product.flaws.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-graphite">
                {product.flaws.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
            <Link href="/condition-guide" className="label mt-3 inline-block underline underline-offset-4">How we grade</Link>
          </section>

          {measurements.length > 0 && (
            <section>
              <h2 className="field-label mb-2">Measured flat, in cm</h2>
              <table className="w-full text-sm">
                <tbody>
                  {measurements.map(([k, v]) => (
                    <tr key={k} className="border-b border-mist">
                      <th scope="row" className="py-2 text-left font-normal text-graphite">{measurementLabels[k] ?? k}</th>
                      <td className="label py-2 text-right">{v} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href="/size-guide" className="label mt-2 inline-block underline underline-offset-4">Compare with a garment you own</Link>
            </section>
          )}

          <section>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {details.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-steel">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {product.description && <p className="mt-4 text-graphite">{product.description}</p>}
          </section>

          <section className="space-y-4 border-t border-mist pt-6">
            <p className="text-sm">
              <span className="label mr-2 text-steel">Ships from</span>
              {product.branch.name}, {product.branch.city}
            </p>
            <DeliveryEstimate fromPincode={product.branch.pincode} />
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="display mb-6 text-4xl md:text-6xl">You might also like</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
