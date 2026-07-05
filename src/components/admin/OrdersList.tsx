"use client";

/**
 * Day-view order cards (003 spec FR2). Presentational: the page owns the
 * polling and passes plain props. Orders in status `new` pulse until someone
 * accepts them — the visual half of the alert (the tone is the page's job).
 */
import { formatBani } from "@/lib/money";
import { STATUS_LABELS_RO, type OrderStatus } from "@/lib/order-status";

import { formatTimeRo, MODE_LABELS_RO, PAYMENT_LABELS_RO } from "@/components/admin/format";
import type { OrderListEntry } from "@/components/admin/types";

const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  new: "bg-amber-500 text-white",
  accepted: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
  in_delivery: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  ready_for_pickup: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  canceled: "bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: Readonly<{ status: OrderStatus }>) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS_RO[status]}
    </span>
  );
}

interface OrdersListProps {
  orders: OrderListEntry[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function OrdersList({ orders, selectedId, onSelect }: Readonly<OrdersListProps>) {
  if (orders.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Nicio comandă pentru filtrul ales.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((order) => {
        const isNew = order.status === "new";
        const isSelected = order.id === selectedId;
        return (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onSelect(order.id)}
              aria-current={isSelected}
              className={`w-full rounded-2xl border bg-white p-3 text-left transition-shadow dark:bg-zinc-900 ${
                isSelected
                  ? "border-amber-600 ring-2 ring-amber-600/40"
                  : "border-zinc-200 hover:shadow-md dark:border-zinc-800"
              } ${isNew ? "animate-pulse border-amber-500 bg-amber-50 dark:bg-amber-950/40" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 font-mono text-sm font-bold">#{order.id}</span>
                  <span className="shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatTimeRo(order.createdAt)}
                  </span>
                  <span className="truncate font-medium">{order.customerName}</span>
                </span>
                <StatusBadge status={order.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatBani(order.totalBani)}</span>
                <span>
                  {MODE_LABELS_RO[order.mode]}
                  {order.zoneName ? ` · ${order.zoneName}` : ""}
                </span>
                <span>{PAYMENT_LABELS_RO[order.paymentMethod]}</span>
                {order.estimateMinutes != null && <span>~{order.estimateMinutes} min</span>}
                {order.scheduledFor && <span>programat {formatTimeRo(order.scheduledFor)}</span>}
                <span className="text-zinc-400 dark:text-zinc-500">{order.phone}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
