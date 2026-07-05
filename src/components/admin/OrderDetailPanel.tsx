"use client";

/**
 * Order detail panel (003 spec FR3/FR4): full order as placed, the action
 * buttons the status graph allows, estimate input at acceptance, cancel
 * dialog with mandatory reason, one-step undo, and the event journal.
 * Presentational: the page performs the HTTP calls and passes results back.
 */
import { useState } from "react";

import { formatBani } from "@/lib/money";
import {
  allowedTransitions,
  deriveUndo,
  STATUS_LABELS_RO,
  TRANSITION_ACTION_LABELS_RO,
  type OrderStatus,
} from "@/lib/order-status";

import { formatTimeRo, MODE_LABELS_RO, PAYMENT_LABELS_RO } from "@/components/admin/format";
import { StatusBadge } from "@/components/admin/OrdersList";
import type { OrderDetailPayload } from "@/components/admin/types";

export interface TransitionExtras {
  reason?: string;
  estimateMinutes?: number;
}

interface OrderDetailPanelProps {
  detail: OrderDetailPayload;
  busy: boolean;
  notice: string | null;
  onTransition: (to: OrderStatus, extras?: TransitionExtras) => void;
  onUndo: () => void;
  onClose: () => void;
}

export function OrderDetailPanel({
  detail,
  busy,
  notice,
  onTransition,
  onUndo,
  onClose,
}: Readonly<OrderDetailPanelProps>) {
  const { order, items, events } = detail;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [estimateInput, setEstimateInput] = useState("");

  const targets = allowedTransitions(order.mode, order.status);
  const forwardTarget = targets.find((target) => target !== "canceled");
  const canCancel = targets.includes("canceled");
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const canUndo = deriveUndo(latestEvent).ok;

  function submitForward() {
    if (!forwardTarget) return;
    if (forwardTarget === "accepted") {
      const trimmed = estimateInput.trim();
      const estimateMinutes = trimmed === "" ? undefined : Number(trimmed);
      onTransition("accepted", estimateMinutes !== undefined ? { estimateMinutes } : undefined);
    } else {
      onTransition(forwardTarget);
    }
  }

  function submitCancel() {
    onTransition("canceled", { reason: cancelReason.trim() });
    setCancelOpen(false);
    setCancelReason("");
  }

  const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-mono text-lg font-bold">#{order.id}</h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{formatTimeRo(order.createdAt)}</span>
          <StatusBadge status={order.status} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide detaliile"
          className="rounded-xl px-2.5 py-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ✕
        </button>
      </header>

      {notice && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      <section className="space-y-1 text-sm">
        <h3 className={sectionTitle}>Client</h3>
        <p className="font-medium">
          {order.customerFirstName} {order.customerLastName}
        </p>
        <p>
          <a href={`tel:${order.phone}`} className="font-medium text-amber-700 dark:text-amber-400">
            {order.phone}
          </a>
          {order.email && <span className="text-zinc-500 dark:text-zinc-400"> · {order.email}</span>}
        </p>
        <p className="text-zinc-600 dark:text-zinc-300">
          {MODE_LABELS_RO[order.mode]}
          {order.zoneName ? ` · ${order.zoneName}` : ""}
          {order.addressStreet ? ` · ${order.addressStreet}` : ""}
        </p>
        <p className="text-zinc-600 dark:text-zinc-300">
          {PAYMENT_LABELS_RO[order.paymentMethod]}
          {order.scheduledFor
            ? ` · programată pentru ${formatTimeRo(order.scheduledFor)}`
            : order.estimateMinutes != null
              ? ` · estimare ~${order.estimateMinutes} min`
              : ""}
        </p>
        {order.notes && (
          <p className="rounded-xl bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            „{order.notes}”
          </p>
        )}
      </section>

      <section className="text-sm">
        <h3 className={sectionTitle}>Produse</h3>
        <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((item) => (
            <li key={item.id} className="py-2">
              <div className="flex justify-between gap-2 font-medium">
                <span>
                  {item.quantity} × {item.productName}
                  {item.variantName ? ` (${item.variantName})` : ""}
                </span>
                <span className="shrink-0 tabular-nums">{formatBani(item.lineTotalBani)}</span>
              </div>
              {item.options.length > 0 && (
                <ul className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                  {item.options.map((option, index) => (
                    <li key={index} className="flex justify-between gap-2">
                      <span>
                        + {option.toppingName}
                        <span className="text-zinc-400 dark:text-zinc-500"> ({option.groupName})</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatBani(option.priceBani + option.sgrDepositBani)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <dl className="mt-1 space-y-0.5 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatBani(order.subtotalBani)}</dd>
          </div>
          {order.sgrBani > 0 && (
            <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
              <dt>Garanție SGR</dt>
              <dd className="tabular-nums">{formatBani(order.sgrBani)}</dd>
            </div>
          )}
          {order.mode === "delivery" && (
            <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
              <dt>Livrare</dt>
              <dd className="tabular-nums">
                {order.deliveryFeeBani === 0 ? "gratuită" : formatBani(order.deliveryFeeBani)}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBani(order.totalBani)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className={sectionTitle}>Acțiuni</h3>
        {forwardTarget === "accepted" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">Estimare (min):</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={estimateInput}
              onChange={(event) => setEstimateInput(event.target.value)}
              placeholder={order.estimateMinutes != null ? String(order.estimateMinutes) : "—"}
              className="w-20 rounded-xl border border-zinc-300 bg-white px-2 py-1.5 tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
            />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">gol = rămâne cea promisă</span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {forwardTarget && (
            <button
              type="button"
              onClick={submitForward}
              disabled={busy}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {TRANSITION_ACTION_LABELS_RO[forwardTarget]}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              disabled={busy}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              Anulează…
            </button>
          )}
          {canUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={busy}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              ↩ Anulează ultimul pas
            </button>
          )}
          {!forwardTarget && !canCancel && !canUndo && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Comanda este într-o stare finală.</p>
          )}
        </div>
      </section>

      <section className="text-sm">
        <h3 className={sectionTitle}>Istoric</h3>
        {events.length === 0 ? (
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Nicio schimbare de stare încă.</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {events.map((event) => (
              <li key={event.id} className="text-zinc-600 dark:text-zinc-300">
                <span className="tabular-nums text-zinc-400 dark:text-zinc-500">
                  {formatTimeRo(event.createdAt)}
                </span>{" "}
                <span className="font-medium">{event.staffDisplayName}</span>:{" "}
                {STATUS_LABELS_RO[event.fromStatus]} → {STATUS_LABELS_RO[event.toStatus]}
                {event.undoOfEventId != null && " (undo)"}
                {event.reason && <span className="text-zinc-500 dark:text-zinc-400"> — „{event.reason}”</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {cancelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Anulare comandă"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900">
            <h3 className="font-bold">Anulezi comanda #{order.id}?</h3>
            <label className="mt-3 block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Motivul anulării (obligatoriu):</span>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                rows={3}
                autoFocus
                maxLength={500}
                placeholder="ex.: clientul nu răspunde la telefon"
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Renunță
              </button>
              <button
                type="button"
                onClick={submitCancel}
                disabled={busy || cancelReason.trim() === ""}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Anulează comanda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
