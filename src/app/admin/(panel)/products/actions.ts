"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { duplicateProduct, markSoldInStore, productFormSchema, saveProduct, setProductStatus } from "@/lib/products";

export type FormResult = { ok: false; error: string; fields?: Record<string, string> } | null;

function refresh(slug?: string) {
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
  if (slug) revalidatePath(`/product/${slug}`);
}

export async function saveProductAction(id: string | null, payload: unknown, publish: boolean): Promise<FormResult> {
  const admin = await requireAdmin();
  let productId: string;
  let publishError = "";
  try {
    const data = productFormSchema.parse(payload);
    const product = await saveProduct({ id: id ?? undefined, data, actor: admin });
    productId = product.id;
    if (publish) {
      // The save already happened; a publish problem is reported on the saved product's page.
      try {
        await setProductStatus({ id: product.id, status: "PUBLISHED", actor: admin });
      } catch (err) {
        if (!(err instanceof DomainError)) throw err;
        publishError = err.message;
      }
    }
    refresh(product.slug);
  } catch (err) {
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const i of err.issues) fields[String(i.path[0])] ??= i.message;
      return { ok: false, error: "Check the highlighted fields.", fields };
    }
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  redirect(`/admin/products/${productId}?${publishError ? `error=${encodeURIComponent(`Saved as draft, not published: ${publishError}`)}` : "saved=1"}`);
}

async function simple(fn: () => Promise<unknown>, back: string) {
  let error = "";
  try {
    await fn();
    refresh();
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    error = err.message;
  }
  redirect(`${back}${back.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error)}` : "done=1"}`);
}

export async function setStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "PUBLISHED" | "HIDDEN" | "DRAFT";
  await simple(() => setProductStatus({ id, status, actor: admin }), String(formData.get("back") || `/admin/products/${id}`));
}

export async function markSoldAction(formData: FormData) {
  const admin = await requireAdmin();
  const variantId = String(formData.get("variantId"));
  await simple(() => markSoldInStore({ variantId, actor: admin }), String(formData.get("back") || "/admin/products"));
}

export async function duplicateAction(formData: FormData) {
  const admin = await requireAdmin();
  const copy = await duplicateProduct({ id: String(formData.get("id")), actor: admin });
  redirect(`/admin/products/${copy.id}`);
}
