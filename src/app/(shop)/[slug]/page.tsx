import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { conditionLabel, conditionMeaning } from "@/lib/catalog";
import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";

// Content pages (PRD §6.10). Legal pages are drafts: the owners and a lawyer must review them before launch.
const pages: Record<string, { title: string; draft?: boolean; body: () => ReactNode | Promise<ReactNode> }> = {
  about: {
    title: "About",
    body: () => (
      <>
        <p>ThriftSyndicate is a crew of collectors with two stores and one rule: every piece is checked, photographed and described honestly before it goes on the rack.</p>
        <p>We deal in T-shirts, jeans and jerseys — band tees and 80s–00s prints, vintage denim from straight to selvedge, football, cricket, basketball and F1 jerseys from past seasons, plus current-season fits at thrift prices.</p>
        <p>Most pieces are one of one. When it&apos;s gone, it&apos;s gone.</p>
      </>
    ),
  },
  stores: {
    title: "Our stores",
    body: async () => {
      const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
      return (
        <div className="not-prose grid gap-6 md:grid-cols-2">
          {branches.map((b) => (
            <div key={b.id} className="border border-mist p-6">
              <h2 className="display text-3xl">{b.name}</h2>
              <p className="mt-2">{b.address}, {b.city} {b.pincode}</p>
              <p className="label mt-2 text-steel">{b.hours}</p>
              <p className="mt-2">{b.phone}</p>
              {b.pickupEnabled && <p className="label mt-2">Free order pickup</p>}
              {b.mapUrl && <a href={b.mapUrl} className="label mt-4 inline-block underline underline-offset-4" target="_blank" rel="noopener noreferrer">Open in Maps</a>}
            </div>
          ))}
        </div>
      );
    },
  },
  "size-guide": {
    title: "Size guide",
    body: () => (
      <>
        <p><strong>Tag sizes lie, especially on vintage.</strong> Every listing shows the garment measured flat, in centimetres. The easiest way to get your size right:</p>
        <ol>
          <li>Take a T-shirt, jersey or pair of jeans you own that fits the way you like.</li>
          <li>Lay it flat and measure it the same way we do (below).</li>
          <li>Compare with the numbers on the listing. Within 2 cm is a close match.</li>
        </ol>
        <h2>Tops and jerseys</h2>
        <ul>
          <li><strong>Chest</strong> — straight across, armpit to armpit.</li>
          <li><strong>Length</strong> — from the highest point of the shoulder to the hem.</li>
          <li><strong>Shoulder</strong> — seam to seam across the back.</li>
        </ul>
        <h2>Jeans</h2>
        <ul>
          <li><strong>Waist</strong> — across the top of the waistband, doubled.</li>
          <li><strong>Inseam</strong> — crotch seam to hem.</li>
          <li><strong>Rise</strong> — crotch seam to the top of the waistband, front.</li>
          <li><strong>Leg opening</strong> — straight across the hem.</li>
        </ul>
      </>
    ),
  },
  "condition-guide": {
    title: "Condition grading",
    body: () => (
      <>
        <p>Every retro piece gets one of four grades. Any flaw is listed and photographed.</p>
        <table>
          <tbody>
            {(["DEADSTOCK", "EXCELLENT", "VERY_GOOD", "GOOD"] as const).map((c) => (
              <tr key={c}>
                <th scope="row">{conditionLabel[c]}</th>
                <td>{conditionMeaning[c]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Latest-season items are listed as <strong>New</strong> or <strong>Like new</strong>.</p>
      </>
    ),
  },
  shipping: {
    title: "Shipping",
    body: () => (
      <>
        <p>We ship across India by courier. Shipping is {formatINR(storeConfig.shippingFeePaise)} per parcel, free on parcels over {formatINR(storeConfig.freeShippingThresholdPaise)}. Pickup from either store is free.</p>
        <p>Each store packs its own pieces, so a bag with items from both stores arrives as two parcels. You pay once.</p>
        <p>After you pay, the store checks your pieces and confirms the order, usually within a few hours. Parcels leave within 2 working days of confirmation. You get the tracking link by SMS and email.</p>
      </>
    ),
  },
  "no-returns": {
    title: "No-returns policy",
    body: () => (
      <>
        <p className="display text-3xl">No returns. No regrets. Check the measurements.</p>
        <p><strong>All sales are final.</strong> We don&apos;t offer returns, exchanges, replacements or store credit. That&apos;s how we keep prices low and pieces moving.</p>
        <p>To make that fair, we show you everything: at least four real photos, the exact measurements, a condition grade and every flaw we can find.</p>
        <p><strong>Changed your mind?</strong> You can cancel for a full refund while your order is &ldquo;Awaiting approval&rdquo;. Once the store confirms it, it&apos;s final.</p>
        <p><strong>If we can&apos;t confirm your order</strong> (for example, it sold in store a moment before), you get a full refund automatically.</p>
        <p><strong>Damaged or wrong item?</strong> Message us within 48 hours of delivery with an unboxing video. We review these one by one.</p>
      </>
    ),
  },
  terms: {
    title: "Terms of sale",
    draft: true,
    body: () => (
      <>
        <ol>
          <li>Prices are in Indian rupees and include GST.</li>
          <li>Payment is taken in full through Razorpay when you place an order. We don&apos;t offer cash on delivery.</li>
          <li>Every order is reviewed by the store before it&apos;s confirmed. If we can&apos;t confirm it, we refund the full amount to your original payment method.</li>
          <li>If we don&apos;t confirm or decline within {storeConfig.approvalDeadlineHours} hours, the order is cancelled and refunded automatically.</li>
          <li>You may cancel while the order is awaiting approval. After confirmation, all sales are final (see the <Link href="/no-returns">no-returns policy</Link>).</li>
          <li>Claims for items damaged in transit or sent in error must be raised within 48 hours of delivery with an unboxing video.</li>
        </ol>
      </>
    ),
  },
  privacy: {
    title: "Privacy",
    draft: true,
    body: () => (
      <>
        <p>We collect your name, mobile number, email and delivery address to fulfil your order, and keep them to send order updates and for tax records. Card and UPI details are handled by Razorpay and never reach our servers.</p>
        <p>We only send marketing messages if you opt in, and you can opt out any time. We don&apos;t sell your data.</p>
        <p>You can ask us to access, correct or delete your data under India&apos;s Digital Personal Data Protection Act, 2023, by contacting either store.</p>
      </>
    ),
  },
  faq: {
    title: "Contact & FAQ",
    body: () => (
      <>
        <h2>How do I know it fits?</h2>
        <p>Compare the listed measurements with something you own. See the <Link href="/size-guide">size guide</Link>.</p>
        <h2>Why does my order say &ldquo;Awaiting approval&rdquo;?</h2>
        <p>The same piece can sell in store, so staff check it&apos;s on the rack and as described before confirming. It usually takes a few hours.</p>
        <h2>When do I get my refund?</h2>
        <p>Refunds go back to your original payment method, usually in 5–7 working days.</p>
        <h2>Can I reserve something?</h2>
        <p>Items are held for 15 minutes while you pay. We can&apos;t hold pieces otherwise.</p>
        <h2>Talk to us</h2>
        <p>WhatsApp or call either store — numbers are on <Link href="/stores">Our stores</Link>. Track an order <Link href="/orders">here</Link>.</p>
      </>
    ),
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const page = pages[(await params).slug];
  return page ? { title: page.title } : {};
}

export default async function ContentPage({ params }: PageProps<"/[slug]">) {
  const page = pages[(await params).slug];
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="display border-b border-ink pb-4 text-5xl md:text-7xl">{page.title}</h1>
      {page.draft && <p className="label mt-4 border border-ink p-2">Draft — to be reviewed by the owners and a lawyer before launch</p>}
      <div className="mt-8 space-y-4 text-graphite [&_h2]:display [&_h2]:pt-6 [&_h2]:text-3xl [&_h2]:text-ink [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_strong]:text-ink [&_table]:w-full [&_td]:border-b [&_td]:border-mist [&_td]:py-2 [&_th]:border-b [&_th]:border-mist [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_a]:underline">
        {await page.body()}
      </div>
    </article>
  );
}
