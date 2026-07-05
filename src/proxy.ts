/**
 * Optimistic redirect ONLY (003 research D2; Next.js docs 16-proxy.md):
 * checks cookie PRESENCE, never the DB — proxy is not a session solution.
 * The real check runs on every request: admin pages call verifySession() in
 * the (panel) layout and every /api/admin/* handler calls requireStaff/
 * requireAdmin. API routes are excluded from the matcher — they answer 401,
 * a redirect would confuse fetch clients.
 */
import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/admin-schemas";

export function proxy(request: NextRequest): NextResponse {
  // /admin/login must pass through — redirecting it to itself loops forever
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
