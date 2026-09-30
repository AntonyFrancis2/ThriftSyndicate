import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { ProductGrid } from "@/components/product-card";
import { categoryLabel, categorySlug, conditionLabel, filterFacets, listProducts, PAGE_SIZE, parseFilters } from "@/lib/catalog";

export const metadata: Metadata = { title: "Shop" };

const topSizes = ["XS", "S", "M", "L", "XL", "XXL"];
const waistSizes = Array.from({ length: 8 }, (_, i) => String(26 + i * 2));
const decades = [1970, 1980, 1990, 2000, 2010, 2020];

function Select({ name, label, value, options }: { name: string; label: string; value?: string | number; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="field">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [{ total, products }, facets] = await Promise.all([listProducts(filters), filterFacets()]);

  const title = filters.q
    ? `“${filters.q}”`
    : [filters.era && (filters.era === "RETRO" ? "Retro" : "Latest"), filters.category ? categoryLabel[filters.category] : "Everything"].filter(Boolean).join(" ");

  const nextPage = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
  nextPage.set("page", String(filters.page + 1));

  const filterFields = (
    <>
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      <Select name="category" label="Category" value={filters.category && categorySlug[filters.category]} options={Object.entries(categorySlug).map(([k, v]) => ({ value: v, label: categoryLabel[k as keyof typeof categoryLabel] }))} />
      <Select name="era" label="Era" value={filters.era?.toLowerCase()} options={[{ value: "retro", label: "Retro" }, { value: "latest", label: "Latest" }]} />
      <Select name="size" label="Size" value={filters.size} options={[...topSizes, ...waistSizes].map((s) => ({ value: s, label: /^\d+$/.test(s) ? `Waist ${s}` : s }))} />
      <Select name="brand" label="Brand" value={filters.brand} options={facets.brands.map((b) => ({ value: b, label: b }))} />
      <Select name="team" label="Team / club" value={filters.team} options={facets.teams.map((t) => ({ value: t, label: t }))} />
      <Select name="decade" label="Decade" value={filters.decade} options={decades.map((d) => ({ value: String(d), label: `${String(d).slice(2)}s` }))} />
      <Select name="condition" label="Condition" value={filters.condition?.toLowerCase()} options={Object.entries(conditionLabel).map(([k, v]) => ({ value: k.toLowerCase(), label: v }))} />
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="field-label">Min ₹</span>
          <input name="min" inputMode="numeric" defaultValue={filters.minPaise ? filters.minPaise / 100 : ""} className="field" />
        </label>
        <label>
          <span className="field-label">Max ₹</span>
          <input name="max" inputMode="numeric" defaultValue={filters.maxPaise ? filters.maxPaise / 100 : ""} className="field" />
        </label>
      </div>
      <Select name="branch" label="Store" value={filters.branch} options={facets.branches.map((b) => ({ value: b.id, label: b.name }))} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="instock" value="1" defaultChecked={filters.inStock} className="size-4 accent-ink" />
        In stock only
      </label>
    </>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div>
          <h1 className="display text-5xl md:text-7xl">{title}</h1>
          <p className="label mt-2 text-steel">{total} piece{total === 1 ? "" : "s"}</p>
        </div>
        <AutoSubmitForm action="/shop" className="flex items-center gap-2" key={`sort-${JSON.stringify(sp)}`}>
          {Object.entries(sp).map(([k, v]) => (typeof v === "string" && k !== "sort" && k !== "page" ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <label className="field-label" htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={filters.sort} className="field w-auto py-1 text-sm">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </AutoSubmitForm>
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside>
          <details className="group lg:hidden">
            <summary className="btn btn-secondary w-full list-none">Filters</summary>
            <AutoSubmitForm action="/shop" className="mt-6 space-y-5" key={`m-${JSON.stringify(sp)}`}>
              {filterFields}
            </AutoSubmitForm>
          </details>
          <AutoSubmitForm action="/shop" className="hidden space-y-5 lg:block" key={`d-${JSON.stringify(sp)}`}>
            {filterFields}
            <Link href="/shop" className="label block pt-2 underline underline-offset-4">Clear all</Link>
          </AutoSubmitForm>
        </aside>

        <section aria-label="Products">
          {products.length === 0 ? (
            <div className="border border-mist p-10 text-center">
              <p className="display text-4xl">Nothing on the rack</p>
              <p className="mt-3 text-graphite">
                Try fewer filters, or check back Friday — new pieces land every week.
              </p>
              <Link href="/shop" className="btn btn-primary mt-6">See everything</Link>
            </div>
          ) : (
            <>
              <ProductGrid products={products} />
              {products.length < total && products.length >= PAGE_SIZE * filters.page && (
                <div className="mt-12 text-center">
                  <Link href={`/shop?${nextPage}`} scroll={false} className="btn btn-secondary">
                    Load more
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
