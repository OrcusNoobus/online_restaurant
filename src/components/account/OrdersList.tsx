"use client";

/**
 * Own-order history with live status (005 T09, Q2/D5): server-rendered
 * initial data, then a relaxed 15s poll of GET /api/account/orders while the
 * page is open (the staff panel polls at 5s; a customer needs less). The
 * statuses are the same rows the staff panel writes.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { STATUS_LABELS_RO, type OrderStatus } from "@/lib/order-status";
import { formatBani } from "@/lib/money";

const POLL_INTERVAL_MS = 15_000;

export interface AccountOrderRow {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  mode: "delivery" | "pickup";
  createdAt: string;
  scheduledFor: string | null;
  estimateMinutes: number | null;
  totalBani: number;
  itemCount: number;
}

const STATUS_CHIP: Record<OrderStatus, string> = {
  new: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  accepted: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  in_delivery: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  ready_for_pickup: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  canceled: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function OrdersList({ initialOrders }: { initialOrders: AccountOrderRow[] }) {
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/account/orders");
        if (!response.ok) return; // expired session etc. — keep the last snapshot
        const body = (await response.json()) as { orders: AccountOrderRow[] };
        setOrders(body.orders);
      } catch {
        // transient network problem — next tick retries
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-bold tracking-tight">Comenzile mele</h2>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Încă nu ai nicio comandă.{" "}
          <Link href="/" className="font-medium text-amber-700 underline dark:text-amber-400">
            Vezi meniul
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/cont/comenzi/${order.id}`}
                className="flex items-center justify-between gap-3 py-3 active:bg-zinc-50 dark:active:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {order.orderNumber}
                    <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                      {order.mode === "delivery" ? "livrare" : "ridicare"} ·{" "}
                      {order.itemCount === 1 ? "1 produs" : `${order.itemCount} produse`}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {formatCreatedAt(order.createdAt)} · {formatBani(order.totalBani)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CHIP[order.status]}`}
                >
                  {STATUS_LABELS_RO[order.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
