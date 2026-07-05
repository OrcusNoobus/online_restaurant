"use client";

/**
 * Status filter chips for the day view. Filtering happens client-side over
 * the full polled day, so the new-order alert never goes blind (research D3).
 */
import { ORDER_STATUSES, STATUS_LABELS_RO, type OrderStatus } from "@/lib/order-status";

interface StatusFilterChipsProps {
  value: OrderStatus | null;
  counts: Partial<Record<OrderStatus, number>>;
  onChange: (value: OrderStatus | null) => void;
}

export function StatusFilterChips({ value, counts, onChange }: Readonly<StatusFilterChipsProps>) {
  const chips: { key: OrderStatus | null; label: string }[] = [
    { key: null, label: "Toate" },
    ...ORDER_STATUSES.map((status) => ({ key: status as OrderStatus | null, label: STATUS_LABELS_RO[status] })),
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {chips.map((chip) => {
        const active = chip.key === value;
        const count = chip.key ? counts[chip.key] : undefined;
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => onChange(chip.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {chip.label}
            {count ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}
