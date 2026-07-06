/**
 * /cont (005 T09): the REAL session check runs here, in the server component
 * (feat-007 layout precedent — no proxy involvement). Anonymous → the
 * login/signup panel (with the Google button only when configured, D8);
 * authenticated → profile + live order history.
 */
import Link from "next/link";
import { cookies } from "next/headers";

import { AuthPanel } from "@/components/account/AuthPanel";
import { LogoutButton } from "@/components/account/LogoutButton";
import { OrdersList } from "@/components/account/OrdersList";
import { ProfileForm } from "@/components/account/ProfileForm";
import { CUSTOMER_SESSION_COOKIE_NAME } from "@/lib/account-schemas";
import { isGoogleConfigured } from "@/server/auth/google";
import { getProfile, listCustomerOrders } from "@/server/services/customer-account";
import { verifyCustomerSession } from "@/server/services/customer-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ eroare?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyCustomerSession(token) : null;

  if (!session) {
    const { eroare } = await searchParams;
    return (
      <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
          <header className="flex items-baseline justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Contul meu</h1>
            <Link href="/" className="text-sm font-medium text-amber-700 dark:text-amber-400">
              ← Înapoi la meniu
            </Link>
          </header>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Opțional: cu un cont, datele tale se precompletează la comandă și îți vezi comenzile cu
            statusul lor. Poți comanda oricând și fără cont.
          </p>
          <div className="mt-6">
            <AuthPanel googleEnabled={isGoogleConfigured()} googleFailed={eroare === "google"} />
          </div>
        </div>
      </div>
    );
  }

  const [customer, orders] = await Promise.all([getProfile(session.id), listCustomerOrders(session.id)]);
  if (!customer) return null; // deleted mid-request — the next render shows the login panel

  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Contul meu</h1>
          <Link href="/" className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ← Înapoi la meniu
          </Link>
        </header>
        <div className="mt-6 space-y-6">
          <OrdersList
            initialOrders={orders.map((order) => ({
              ...order,
              createdAt: order.createdAt.toISOString(),
              scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
            }))}
          />
          <ProfileForm customer={customer} />
          <div className="flex justify-end">
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
