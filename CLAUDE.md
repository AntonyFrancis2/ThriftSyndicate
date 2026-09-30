@AGENTS.md

# ThriftSyndicate

- Next.js 16 (App Router, Turbopack, `proxy.ts` not middleware), React 19, Tailwind 4, Prisma 7 with the `pg` adapter, Postgres 16.
- Money is integer paise everywhere. Prices include GST.
- Business rules live in `src/lib/orders/*` and are covered by `tests/`. Pages and server actions stay thin and call them.
- Every order state change goes through `src/lib/orders/decisions.ts` (row-locked, audited, notifies the customer). Refunds happen after the state change commits (`refunds.ts`).
- Branch admins only act on their own branch: use `assertBranchAccess` / `branchScope`.
- No returns, exchanges or consignment anywhere in the product. Payment is captured at order time; rejection = full refund.
- Run `npm test`, `npm run typecheck` and `npm run lint` before committing. Tests need `TEST_DATABASE_URL` and wipe that database.
- Brand: black/white/grey tokens in `src/app/globals.css`; red (`signal`) only for errors and the Sold overlay.
