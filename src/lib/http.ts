import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { DomainError } from "@/lib/errors";

// Maps expected failures to 4xx JSON; anything else is logged and returned as a generic 500.
export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    // Keyed by the innermost field name ("phone", "pincode") so forms can show errors next to inputs.
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = String(issue.path.at(-1) ?? "form");
      (fields[key] ??= []).push(issue.message);
    }
    return Response.json({ error: "Please check the highlighted fields.", fields, code: "INVALID_INPUT" }, { status: 400 });
  }
  if (err instanceof DomainError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : err.code === "BAD_SIGNATURE" ? 400 : 409;
    return Response.json({ error: err.message, code: err.code, details: err.code === "ITEMS_UNAVAILABLE" ? err.details : undefined }, { status });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong. Please try again.", code: "INTERNAL" }, { status: 500 });
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

// Scheduled-job endpoints are called by GitHub Actions with `Authorization: Bearer $CRON_SECRET`.
export function cronAuthorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
