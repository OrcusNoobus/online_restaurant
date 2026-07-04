"use client";

/**
 * Order confirmation — reads the placed order from sessionStorage (set by
 * checkout right before navigation). Orders are not publicly queryable in
 * v1, so a direct visit without a fresh order just links back to the menu.
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { formatBani } from "@/lib/money";
import type { PlacedOrderView } from "@/lib/quote-types";
import { RESTAURANT_ADDRESS } from "@/lib/restaurant-config";

const noop = () => () => {};

function readLastOrder(): string | null {
  return window.sessionStorage.getItem("rfd-last-order");
}

export default function ConfirmationPage() {
  const raw = useSyncExternalStore(noop, readLastOrder, () => null);
  const order = raw ? (JSON.parse(raw) as PlacedOrderView) : null;

  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-12 text-center">
        {order ? (
          <>
            <p aria-hidden className="text-5xl">
              ✅
            </p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Comanda {order.orderNumber} a fost plasată!</h1>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">
              {order.mode === "delivery"
                ? order.scheduledFor
                  ? `O livrăm azi la ${new Date(order.scheduledFor).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}.`
                  : `Timp estimat de livrare: ~${order.estimateMinutes} minute.`
                : order.scheduledFor
                  ? `Te așteptăm azi la ${new Date(order.scheduledFor).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })} la ${RESTAURANT_ADDRESS}.`
                  : `Comanda este gata în ~${order.estimateMinutes} minute la ${RESTAURANT_ADDRESS}.`}
            </p>

            <dl className="mx-auto mt-8 max-w-sm space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-left text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatBani(order.subtotalBani)}</dd>
              </div>
              {order.sgrBani > 0 && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Garanție SGR</dt>
                  <dd className="font-semibold tabular-nums">{formatBani(order.sgrBani)}</dd>
                </div>
              )}
              {order.deliveryFeeBani > 0 && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Taxă de livrare</dt>
                  <dd className="font-semibold tabular-nums">{formatBani(order.deliveryFeeBani)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-200 pt-2 text-base dark:border-zinc-700">
                <dt className="font-semibold">Total de plată</dt>
                <dd className="font-bold tabular-nums">{formatBani(order.totalBani)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              Plata se face la {order.mode === "delivery" ? "livrare" : "restaurant"}. Păstrează numărul comenzii:{" "}
              <strong>{order.orderNumber}</strong>.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Nicio comandă recentă</h1>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">Comanda ta a fost deja procesată sau nu există.</p>
          </>
        )}

        <Link href="/" className="mt-8 inline-block rounded-full bg-amber-600 px-6 py-2.5 font-semibold text-white">
          Înapoi la meniu
        </Link>
      </div>
    </div>
  );
}
