"use client";

/**
 * Day browser + whole-day totals bar (003 spec FR2, clarify Q11: totals
 * exclude canceled orders; canceled reported apart). Presentational only.
 */
import { formatBani } from "@/lib/money";

import { formatDayLabelRo } from "@/components/admin/format";
import type { DayTotals } from "@/components/admin/types";

interface DayHeaderProps {
  dateKey: string;
  isToday: boolean;
  totals: DayTotals | null;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}

export function DayHeader({ dateKey, isToday, totals, onPrevDay, onNextDay, onToday }: Readonly<DayHeaderProps>) {
  const navButton =
    "rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrevDay} aria-label="Ziua precedentă" className={navButton}>
          ←
        </button>
        <span className="min-w-24 text-center font-semibold capitalize tabular-nums">
          {isToday ? "Azi" : formatDayLabelRo(dateKey)}
        </span>
        <button type="button" onClick={onNextDay} aria-label="Ziua următoare" className={navButton}>
          →
        </button>
        {!isToday && (
          <button type="button" onClick={onToday} className={`${navButton} text-amber-700 dark:text-amber-400`}>
            Azi
          </button>
        )}
      </div>
      {totals && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{totals.count} comenzi</span>
          {" · "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatBani(totals.totalBani)}</span>
          {totals.canceledCount > 0 && ` · ${totals.canceledCount} anulate`}
        </p>
      )}
    </div>
  );
}
