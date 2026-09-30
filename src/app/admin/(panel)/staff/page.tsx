import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { requireSuperAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const staffSchema = z.object({
  name: z.string().trim().min(2),
  email: z.email().transform((e) => e.toLowerCase()),
  role: z.enum(["SUPER_ADMIN", "BRANCH_ADMIN"]),
  branchId: z.string().optional(),
  password: z.string().min(12, "Temporary password must be at least 12 characters"),
});

async function createStaff(formData: FormData) {
  "use server";
  const admin = await requireSuperAdmin();
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/staff?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const d = parsed.data;
  if (d.role === "BRANCH_ADMIN" && !d.branchId) redirect(`/admin/staff?error=${encodeURIComponent("Choose a branch for a branch admin")}`);
  if (await db.adminUser.findUnique({ where: { email: d.email } })) redirect(`/admin/staff?error=${encodeURIComponent("That email already has an account")}`);
  const user = await db.adminUser.create({
    data: { name: d.name, email: d.email, role: d.role, branchId: d.role === "BRANCH_ADMIN" ? d.branchId : null, passwordHash: await hashPassword(d.password) },
  });
  await db.auditLog.create({ data: { adminId: admin.id, action: "staff.create", entity: "AdminUser", entityId: user.id, after: { email: d.email, role: d.role } } });
  revalidatePath("/admin/staff");
  redirect("/admin/staff?done=1");
}

async function toggleActive(formData: FormData) {
  "use server";
  const admin = await requireSuperAdmin();
  const id = String(formData.get("id"));
  if (id === admin.id) redirect(`/admin/staff?error=${encodeURIComponent("You can't deactivate yourself")}`);
  const active = formData.get("active") === "1";
  await db.adminUser.update({ where: { id }, data: { active } });
  await db.auditLog.create({ data: { adminId: admin.id, action: active ? "staff.activate" : "staff.deactivate", entity: "AdminUser", entityId: id } });
  revalidatePath("/admin/staff");
}

const branchSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2),
  address: z.string().trim().min(5),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/),
  phone: z.string().trim().min(6),
  hours: z.string().trim().min(2),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9]{2}[A-Z0-9]{13}$/, "GSTIN is 15 characters").transform((v) => v || null),
  pickupEnabled: z.literal("on").optional(),
});

async function saveBranch(formData: FormData) {
  "use server";
  const admin = await requireSuperAdmin();
  const parsed = branchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/staff?error=${encodeURIComponent(`Branch: ${parsed.error.issues[0].message}`)}`);
  const { id, pickupEnabled, ...data } = parsed.data;
  await db.branch.update({ where: { id }, data: { ...data, pickupEnabled: pickupEnabled === "on" } });
  await db.auditLog.create({ data: { adminId: admin.id, action: "branch.update", entity: "Branch", entityId: id, after: data } });
  // Branch details appear in the footer and store pages.
  revalidatePath("/", "layout");
  redirect("/admin/staff?done=1");
}

export default async function StaffPage({ searchParams }: PageProps<"/admin/staff">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const [staff, branches] = await Promise.all([
    db.adminUser.findMany({ include: { branch: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.branch.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="display text-5xl">Staff & branches</h1>
      {typeof sp.error === "string" && <p className="border border-signal bg-paper p-3 text-sm text-signal" role="alert">{sp.error}</p>}
      {sp.done && <p className="border border-ink bg-paper p-3 text-sm" role="status">Saved.</p>}

      <section className="overflow-x-auto bg-paper">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="field-label border-b border-ink text-left"><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Branch</th><th className="pr-3" /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className={`border-b border-mist ${s.active ? "" : "text-steel"}`}>
                <td className="p-3">{s.name}</td>
                <td>{s.email}</td>
                <td className="label">{s.role === "SUPER_ADMIN" ? "Super admin" : "Branch admin"}</td>
                <td>{s.branch?.name ?? "All"}</td>
                <td className="pr-3 text-right">
                  <form action={toggleActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                    <button className="label underline">{s.active ? "Deactivate" : "Reactivate"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form action={createStaff} className="grid gap-5 bg-paper p-5 md:grid-cols-3">
        <h2 className="display text-3xl md:col-span-3">Add staff</h2>
        <label><span className="field-label">Name</span><input name="name" required className="field" /></label>
        <label><span className="field-label">Email</span><input name="email" type="email" required className="field" /></label>
        <label><span className="field-label">Temporary password (12+)</span><input name="password" type="text" minLength={12} required className="field" autoComplete="off" /></label>
        <label>
          <span className="field-label">Role</span>
          <select name="role" className="field"><option value="BRANCH_ADMIN">Branch admin</option><option value="SUPER_ADMIN">Super admin</option></select>
        </label>
        <label>
          <span className="field-label">Branch (branch admins)</span>
          <select name="branchId" className="field">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <div className="flex items-end"><button className="btn btn-primary w-full">Create account</button></div>
      </form>

      <section className="grid gap-6 lg:grid-cols-2">
        {branches.map((b) => (
          <form key={b.id} action={saveBranch} className="space-y-4 bg-paper p-5">
            <h2 className="display text-3xl">{b.name} <span className="label text-steel">{b.code}</span></h2>
            <input type="hidden" name="id" value={b.id} />
            <label className="block"><span className="field-label">Name</span><input name="name" defaultValue={b.name} className="field" /></label>
            <label className="block"><span className="field-label">Address</span><input name="address" defaultValue={b.address} className="field" /></label>
            <div className="grid grid-cols-3 gap-3">
              <label><span className="field-label">City</span><input name="city" defaultValue={b.city} className="field" /></label>
              <label><span className="field-label">State</span><input name="state" defaultValue={b.state} className="field" /></label>
              <label><span className="field-label">PIN</span><input name="pincode" defaultValue={b.pincode} className="field" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="field-label">Phone</span><input name="phone" defaultValue={b.phone} className="field" /></label>
              <label><span className="field-label">GSTIN</span><input name="gstin" defaultValue={b.gstin ?? ""} className="field uppercase" /></label>
            </div>
            <label className="block"><span className="field-label">Hours</span><input name="hours" defaultValue={b.hours} className="field" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pickupEnabled" defaultChecked={b.pickupEnabled} className="accent-ink" /> Offer free pickup at this store</label>
            <button className="btn btn-secondary">Save branch</button>
          </form>
        ))}
      </section>
      <p className="label text-steel">Shipping rates, approval deadlines and reservation time are in src/lib/config.ts for now. Two-factor login for staff is next on the list.</p>
    </div>
  );
}
