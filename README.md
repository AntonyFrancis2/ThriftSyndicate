# ThriftSyndicate

Online store and admin panel for ThriftSyndicate's two branches: retro and latest-season T-shirts, jeans and jerseys.
Every order is paid in full through Razorpay, checked and approved by the branch before it ships, and final — no returns.

Product requirements: [ThriftSyndicate Online Store — PRD](https://claude.ai/code/artifact/16049dfd-238b-4294-996f-023168dbf5e5).

## Run it locally

Needs Node 20.9+ and PostgreSQL 16.

```bash
cp .env.example .env          # fill in DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET, CRON_SECRET
createdb thriftsyndicate && createdb thriftsyndicate_test
npm install                   # also generates the Prisma client
npx prisma migrate dev        # create tables
npm run db:seed               # 2 placeholder branches, 20 products, 3 staff logins
npm run dev                   # http://localhost:3000
```

Staff logins after seeding (password `thrift-dev-123`, or `SEED_ADMIN_PASSWORD`):

| Login | Can see |
| --- | --- |
| owner@thriftsyndicate.local | Everything (super admin) |
| indiranagar@thriftsyndicate.local | Indiranagar branch only |
| bandra@thriftsyndicate.local | Bandra West branch only |

Admin panel: http://localhost:3000/admin

**Payments without Razorpay keys.** Leave the `RAZORPAY_*` variables empty and checkout uses a built-in mock:
clicking Pay opens a "Mock Razorpay" window instead of the real one. A production build refuses the mock
unless `PAYMENTS_MOCK=1` is set (for demos only — never on the live site).

**Razorpay test mode.** Put test keys in `.env`, then in the Razorpay dashboard add a webhook to
`https://<your-site>/api/webhooks/razorpay` with the events `payment.authorized`, `payment.captured`,
`payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, and the same secret as `RAZORPAY_WEBHOOK_SECRET`.
The account must use automatic capture.

**Scheduled jobs.** Call this every 5 minutes (Vercel Cron, GitHub Actions or crontab). It releases unpaid holds after
15 minutes, alerts the owner about orders undecided at 24 hours, and auto-rejects with a full refund at 48 hours.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-site>/api/cron/sweep
```

## Tests

```bash
npm test          # unit + integration tests against TEST_DATABASE_URL (wiped on every run)
npm run typecheck
npm run lint
```

The integration tests cover the business rules end to end: split orders per branch, no double-selling under
concurrent checkouts, signature checks, duplicate webhooks, late payments after a hold lapses, approve/reject/cancel
with refunds, refund failures, the 24h/48h deadlines, pickup codes, branch scoping, the publish gate and in-store sales.

## How it fits together

| Area | Where |
| --- | --- |
| Business rules (checkout, payment, approval, refunds, jobs) | `src/lib/orders/` |
| Payment gateway (Razorpay + local mock) | `src/lib/payments/` |
| Store settings to confirm with owners (holds, deadlines, shipping) | `src/lib/config.ts` |
| Catalogue queries and search | `src/lib/catalog.ts` |
| Products, publish gate (BR9), mark sold in store (BR7) | `src/lib/products.ts` |
| Storefront pages | `src/app/(shop)/` |
| Admin panel | `src/app/admin/` |
| Invoices and packing slips | `src/app/(print)/`, `src/components/invoice.tsx` |
| Database schema | `prisma/schema.prisma` |

A bag with items from both branches becomes one **Checkout** (one Razorpay payment) with one **Order** per branch.
Items are **reserved** for 15 minutes when the customer clicks Pay and stay held after payment until the branch decides.
Stock only leaves the shelf when an order is approved.

## Not built yet

- Photo upload (Cloudinary/S3) — products take image URLs for now; seed data uses placeholder drawings
- Email, SMS and WhatsApp delivery — every message is recorded in the `Notification` table, ready for a provider (Resend, MSG91)
- Customer accounts with phone OTP and saved addresses — guests track orders by private link or order number + mobile
- Staff two-factor login
- Discount codes, banners, scheduled drops and curated collections managed from the admin panel
- Wishlist, "notify me", partial approval, bulk approve, CSV bulk upload, barcode scanning
- Courier booking (Shiprocket) and real delivery estimates
- Nightly Razorpay reconciliation job
- Dark mode

## Open questions for the owners

Branch names, addresses and GSTINs (placeholders now) · approval deadline (24h alert / 48h auto-reject) ·
shipping fee (₹99/parcel, free over ₹1,999) · Instant Refunds for rejections · damaged-in-transit claims ·
GST rates and HSN codes (5% ≤ ₹2,500, 18% above — confirm with the accountant) · final legal text for terms and privacy.
