import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: bounce visitors without a valid admin cookie to the login page.
// Every admin page and action still re-checks the session against the database.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get("ts_admin")?.value;
  let valid = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), { algorithms: ["HS256"] });
      valid = true;
    } catch {
      valid = false;
    }
  }
  if (!valid) {
    const url = new URL("/admin/login", req.nextUrl);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
