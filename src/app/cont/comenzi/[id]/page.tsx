/**
 * /cont/comenzi/:id (005 T09, D-f): read-only own-order detail — a snapshot,
 * no polling (the list page is live). Unknown ids and other customers' orders
 * are both a 404 (ownership never leaks).
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { CUSTOMER_SESSION_COOKIE_NAME } from "@/lib/account-schemas";
import { formatBani } from "@/lib/money";
import { STATUS_LABELS_RO, type OrderStatus } from "@/lib/order-status";
import { getCustomerOrderDetail } from "@/server/services/customer-account";
import { verifyCustomerSession } from "@/server/services/customer-auth";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<OrderStatus, string> = {
  new: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  accepted: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  in_delivery: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  ready_for_pickup: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  canceled: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Numerar",
  card_delivery: "Card la livrare",
  card_restaurant: "Card la restaurant",
};

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyCustomerSession(token) : null;
  if (!session) redirect("/cont");

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const order = await getCustomerOrderDetail(session.id, orderId);
  if (!order) notFound();

  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Comanda {order.orderNumber}</h1>
          <Link href="/cont" className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ← Contul meu
          </Link>
        </header>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CHIP[order.status]}`}>
            {STATUS_LABELS_RO[order.status]}
          </span>
          <span>{order.mode === "delivery" ? "Livrare" : "Ridicare personală"}</span>
          <span>· {formatDateTime(order.createdAt)}</span>
          {order.scheduledFor && <span>· programată pentru {formatDateTime(order.scheduledFor)}</span>}
          {!order.scheduledFor && order.estimateMinutes !== null && (
            <span>· estimare {order.estimateMinutes} min</span>
          )}
        </div>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {order.items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {item.quantity} × {item.productName}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </p>
                  <p className="shrink-0 font-semibold">{formatBani(item.lineTotalBani)}</p>
                </div>
                {item.options.length > 0 && (
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {item.options.map((option) => option.toppingName).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
            <div className="flex justify-between">
              <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
              <dd>{formatBani(order.subtotalBani)}</dd>
            </div>
            {order.sgrBani > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">Garanție SGR</dt>
                <dd>{formatBani(order.sgrBani)}</dd>
              </div>
            )}
            {order.mode === "delivery" && (
              <div className="flex justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">Livrare</dt>
                <dd>{order.deliveryFeeBani === 0 ? "gratuită" : formatBani(order.deliveryFeeBani)}</dd>
              </div>
            )}
            {order.couponCode !== null && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <dt>Reducere ({order.couponCode})</dt>
                <dd>−{formatBani(order.discountBani)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd>{formatBani(order.totalBani)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p>
            <span className="text-zinc-500 dark:text-zinc-400">Plată:</span>{" "}
            {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
          {order.mode === "delivery" && (
            <p className="mt-1">
              <span className="text-zinc-500 dark:text-zinc-400">Adresă:</span> {order.addressStreet}
              {order.zoneName ? `, ${order.zoneName}` : ""}
            </p>
          )}
          {order.notes && (
            <p className="mt-1">
              <span className="text-zinc-500 dark:text-zinc-400">Mențiuni:</span> {order.notes}
            </p>
          )}
        </section>

        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Pentru modificări sau anulare, sună-ne — comenzile nu se pot modifica din cont.
        </p>
      </div>
    </div>
  );
}
