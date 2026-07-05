/**
 * Protected admin shell (003 research D2): the REAL session check — the proxy
 * only checks cookie presence. Every page inside the (panel) group renders
 * with a verified user; nav is role-aware (Q14: zones/settings admin-only).
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/admin/LogoutButton";
import { SESSION_COOKIE_NAME } from "@/lib/admin-schemas";
import { verifySession } from "@/server/services/auth";

export const metadata = {
  title: "Panou Royal",
  robots: { index: false, follow: false },
};

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await verifySession(token) : null;
  if (!user) redirect("/admin/login");

  const links = [
    { href: "/admin", label: "Comenzi" },
    { href: "/admin/produse", label: "Produse" },
    ...(user.role === "admin"
      ? [
          { href: "/admin/zone", label: "Zone" },
          { href: "/admin/setari", label: "Setări" },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-1 overflow-x-auto">
            <span className="mr-2 shrink-0 font-bold tracking-tight">Royal</span>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
              {user.displayName} · {user.role === "admin" ? "administrator" : "angajat"}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
