"use client";

/**
 * Availability switch (003 Q14): the one control BOTH roles get on
 * products / variants / toppings; categories show it to admin only —
 * the page decides, this component just renders state + intent.
 */
export function AvailabilityToggle({
  active,
  busy,
  onToggle,
}: Readonly<{ active: boolean; busy: boolean; onToggle: () => void }>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={busy}
      onClick={onToggle}
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
        active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
          : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {active ? "Activ" : "Inactiv"}
    </button>
  );
}
