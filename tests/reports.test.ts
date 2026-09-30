import { beforeEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approveOrder, rejectOrder, setFoundOnRack } from "@/lib/orders/decisions";
import { salesReport } from "@/lib/reports";
import { makeAdmin, makeBranch, makeProduct, placePaidOrder, resetDb } from "./helpers";

beforeEach(resetDb);

it("counts approved revenue and rejection reasons, scoped to the branch", async () => {
  const a = await makeBranch("AAA");
  const b = await makeBranch("BBB");
  const adminA = await makeAdmin("BRANCH_ADMIN", a.id);
  const p1 = await makeProduct(a.id, { pricePaise: 250_000 });
  const p2 = await makeProduct(a.id, { pricePaise: 100_000 });
  const p3 = await makeProduct(b.id, { pricePaise: 500_000 });

  const c1 = await placePaidOrder([p1.variants[0].id]);
  const c2 = await placePaidOrder([p2.variants[0].id]);
  await placePaidOrder([p3.variants[0].id]);
  const o1 = await db.order.findFirstOrThrow({ where: { checkoutId: c1.checkoutId }, include: { items: true } });
  const o2 = await db.order.findFirstOrThrow({ where: { checkoutId: c2.checkoutId } });
  await setFoundOnRack({ orderItemId: o1.items[0].id, found: true, actor: adminA });
  await approveOrder({ orderId: o1.id, actor: adminA });
  await rejectOrder({ orderId: o2.id, reason: "DAMAGED", actor: adminA });

  const r = await salesReport(adminA, new Date(Date.now() - 86_400_000), new Date(Date.now() + 60_000));
  expect(r.revenuePaise).toBe(250_000); // free shipping above the threshold
  expect(r.approvedCount).toBe(1);
  expect(r.paidCount).toBe(2); // branch B's order is not visible to a branch A admin
  expect(r.rejectionReasons).toEqual([["Item damaged", 1]]);
  expect(r.medianApprovalHours).not.toBeNull();
});
