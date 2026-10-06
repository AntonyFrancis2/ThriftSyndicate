# Deploying ThriftSyndicate

How the live site runs, what each service costs, the launch schedule and how releases work afterwards.

## The setup

| Piece | Service | Plan | Cost |
| --- | --- | --- | --- |
| Website and API | Vercel, Mumbai (`bom1`) | Hobby for staging, **Pro from the production launch** (Hobby is for non-commercial sites only) | ₹0, then US$20/month |
| Database | Neon Postgres, Asia Pacific | Free: 0.5 GB, sleeps when idle | ₹0 |
| Product photos | Cloudinary | Free: 25 credits/month | ₹0 |
| Email | Resend | Free: 3,000/month, 100/day | ₹0 |
| SMS | MSG91 | Pay per message; DLT registration first | Per message |
| WhatsApp | Meta WhatsApp Cloud API | Pay per message (utility templates) | Per message |
| Scheduled jobs, CI, backups | GitHub Actions | Free for public repositories | ₹0 |
| Payments | Razorpay | No monthly fee; a percentage of each payment | Per payment |
| Domain | Any registrar | Yearly | Yearly fee |

Check each provider's current pricing before signing up; free-tier limits change.

**When the free tiers stop being enough:** Resend at about 25–30 orders a day (each order sends 3–4 emails), Neon past
0.5 GB (tens of thousands of orders), Cloudinary past roughly 2,000 product photos a month of traffic. Each has a paid
tier that is a settings change, not a rebuild.

## Environments

| | Staging | Production |
| --- | --- | --- |
| URL | `<project>-git-main-<team>.vercel.app`, plus a preview link per pull request | your domain |
| Deploys from | every push to `main` and every pull request | the `production` branch (see Releases) |
| Database | Neon branch `staging` | Neon branch `production` |
| Razorpay | test keys | live keys |
| Messages | email only, to staff addresses | email + SMS/WhatsApp |

Migrations run automatically during each Vercel build (`npm run vercel-build`), so a deploy and its database change
always go out together. Migrations only ever add; never edit an applied migration.

## One-time setup

Owner tasks marked **(owner)** need the business's documents or logins; start them first, they have waiting times.

1. **(owner) Razorpay live activation.** Dashboard → Activate account: PAN, GST, bank account, business address.
   Razorpay reviews the website, so staging must show the Terms, Privacy, Shipping and No-returns pages with final
   text. Takes about 2–5 working days. Settings → Payment capture: **automatic**.
2. **(owner) Domain.** Buy it; point it at Vercel in step 6.
3. **(owner) SMS DLT registration.** Register the business as a principal entity on a DLT portal (Jio, Airtel or Vi),
   register the sender ID (e.g. `THRFTS`) and the seven SMS templates below, then add them in MSG91 as Flows.
   Takes about 3–7 working days.
4. **(owner) WhatsApp.** Meta Business Suite → verify the business → WhatsApp Manager → add a phone number not
   already on WhatsApp → submit the seven templates below as category **Utility**. Optional at launch: SMS covers phones
   until WhatsApp is approved.
5. **Neon.** Project `ThriftSyndicate` (`patient-mode-71241691`, Postgres 18, Singapore). Branches: `production` and `staging` (made from it). For each
   branch copy the **pooled** connection string (host contains `-pooler`) → `DATABASE_URL`, and the **direct** one →
   `DIRECT_URL`.
6. **Vercel.** Import the GitHub repo. Settings → Git → Production Branch: `production` (so `main` is staging and
   nothing reaches customers until it is released). Settings → Environment Variables: add every variable from `.env.example`,
   with Preview values for staging and Production values for live (table below). Add the domain under Domains.
7. **Cloudinary.** Sign up; Settings → API Keys → copy cloud name, key and secret.
8. **Resend.** Add the domain, add the DNS records it shows, wait for Verified. `EMAIL_FROM` =
   `ThriftSyndicate <orders@yourdomain>`.
9. **Razorpay webhook.** Dashboard → Webhooks → `https://<domain>/api/webhooks/razorpay`, events
   `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`,
   secret = `RAZORPAY_WEBHOOK_SECRET`. Do the same in test mode against the staging URL.
10. **GitHub secrets** (repo → Settings → Secrets and variables → Actions): `SITE_URL`, `CRON_SECRET`, `DATABASE_URL`
    (production **direct** URL, for backups), `BACKUP_PASSPHRASE` (store it in the owners' password manager too — a
    backup can't be restored without it).
11. **First data.** Run `npm run db:seed` against staging only. In production, create the owner account and real
    branches from a laptop (`DATABASE_URL=<prod direct> npm run db:seed` then change every password and branch detail
    at `/admin/staff`), or ask for a production bootstrap script.

### Variables

| Variable | Staging (Preview) | Production |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Neon `staging` | Neon `main` |
| `SESSION_SECRET`, `CRON_SECRET` | own random values (`openssl rand -base64 48`) | different random values |
| `NEXT_PUBLIC_SITE_URL` | staging URL | `https://<domain>` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | test keys | live keys |
| `PAYMENTS_MOCK` | empty | **must be empty** |
| `CLOUDINARY_*` | same account | same account |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | set | set |
| `MSG91_*`, `WHATSAPP_*` | empty (no texts to customers from staging) | set once templates are approved |

## Message templates to register

SMS (DLT uses `{#var#}`; MSG91 Flows call them `##var1##`, `##var2##` … in this order):

| Template | Text |
| --- | --- |
| `order_placed` | ThriftSyndicate: Order {#var#} placed. We received {#var#}. The store confirms within 24h, or you get a full refund automatically. |
| `order_approved` | ThriftSyndicate: Order {#var#} is confirmed and being packed. |
| `order_rejected` | ThriftSyndicate: Sorry, we couldn't confirm order {#var#}. A full refund of {#var#} is on its way (5-7 working days). |
| `order_cancelled` | ThriftSyndicate: Order {#var#} is cancelled. A refund of {#var#} is on its way (5-7 working days). |
| `order_shipped` | ThriftSyndicate: Order {#var#} has shipped with {#var#}, AWB {#var#}. |
| `order_ready_for_pickup` | ThriftSyndicate: Order {#var#} is ready to collect. Pickup code {#var#}. |
| `order_delivered` | ThriftSyndicate: Order {#var#} has been delivered. Thanks for shopping with us. |

WhatsApp: the same texts, with `{{1}}`, `{{2}}`, `{{3}}` in place of each `{#var#}`.
Then set `MSG91_SMS_TEMPLATES` / `WHATSAPP_TEMPLATES` to JSON mapping each name above to its flow id / template name.
A template without a mapping is skipped (recorded, not sent), so they can be switched on one at a time.
Staff alerts (overdue approvals, failed refunds, payment mismatches) go by email only.

## What runs on a schedule

| Job | When | Where |
| --- | --- | --- |
| Sweep: release unpaid holds, 24h alerts, 48h auto-reject + refund, send waiting messages | every 5 minutes | `.github/workflows/cron.yml` → `/api/cron/sweep` |
| Payment reconciliation: record any captured payment we missed, alert on mismatches | 03:00 IST | `cron.yml` → `/api/cron/reconcile` |
| Encrypted database backup, kept 14 days | 03:30 IST | `.github/workflows/backup.yml` |
| Tests, typecheck, lint | every pull request and push to `main` | `.github/workflows/ci.yml` |

GitHub may start scheduled runs a few minutes late, and turns schedules off after 60 days without commits; re-enable
under Actions if that happens. Messages are also sent straight after each order action, so the sweep is only a retry.

## Launch schedule

| Date (2026) | What | Who |
| --- | --- | --- |
| Tue 6 Oct | Backend complete: photo upload, email/SMS/WhatsApp delivery, reconciliation, CI, scheduled jobs, backups. Owners start Razorpay activation, domain, DLT and WhatsApp verification. | Dev, owner |
| Wed 7 Oct | **Staging live** on Vercel + Neon with Razorpay test keys; Cloudinary and Resend connected. | Dev |
| Thu 8 – Mon 12 Oct | Staff load real products (4+ photos each) on staging; owners run the full flow: buy, approve, reject → refund, pickup, ship. Final legal text, branch addresses, GSTINs. | Owner, staff |
| **Tue 13 Oct** | **Production release.** Vercel Pro, production database, domain, Razorpay live keys. **Soft launch:** staff and friends place real orders; test one real refund. | Dev, owner |
| **Fri 16 Oct** | **Public launch** with Drop 001. Email live; SMS live if DLT is approved. | Owner |
| Tue 20 Oct | First weekly release: launch fixes; WhatsApp on if approved. | Dev |

**Critical path: Razorpay live activation.** If it isn't approved by Mon 12 Oct, the soft launch moves to the day it
is, and the public launch to the Friday after.

## Releases after launch

- **Window:** Tuesdays 10:00–12:00 IST. What ships is `main` as it has been on staging since at least the previous day.
- **Freeze:** Thursday 18:00 to Monday morning (drops go live on Fridays; weekends are busiest). No releases.
- **Hotfixes:** any time for broken checkout, payments or admin, with the owner's OK. Same path: pull request → CI →
  staging → promote.
- **How to release:** CI green on `main` → check staging → `git push origin main:production` (fast-forward). Vercel
  builds production from it. **Rollback:** Vercel → Deployments → the previous production deployment → Promote
  (instant; a migration stays applied, which is why migrations only add).
- **After each release:** place one test order on staging, check `/admin/payments` and that the 5-minute sweep ran
  (GitHub → Actions → Scheduled jobs).
