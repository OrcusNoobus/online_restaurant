"use client";

/**
 * Delivery zones admin (003 spec FR8, admin-only): list all zones incl.
 * inactive, edit fee/threshold via price cells, deactivate (never delete —
 * past orders reference zones via RESTRICT FK), add new. Fee model: the fee
 * applies BELOW the threshold, free at/above (002 owner decision).
 */
import { useState } from "react";

import type { PatchFn } from "@/components/admin/CatalogCategoryBlock";
import { AvailabilityToggle } from "@/components/admin/AvailabilityToggle";
import { parseLeiToBani } from "@/components/admin/format";
import { PriceCell } from "@/components/admin/PriceCell";
import type { ZoneRow } from "@/components/admin/types";

interface ZonesTableProps {
  zones: ZoneRow[];
  onPatchZone: PatchFn;
  onCreateZone: (input: { name: string; feeBani: number; freeFromBani: number }) => Promise<string | null>;
}

export function ZonesTable({ zones, onPatchZone, onCreateZone }: Readonly<ZonesTableProps>) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle(zone: ZoneRow) {
    setBusyId(zone.id);
    setNotice(null);
    const error = await onPatchZone(zone.id, { active: !zone.active });
    setBusyId(null);
    if (error) setNotice(error);
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {zones.map((zone) => (
          <li key={zone.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <span
              className={`min-w-32 font-medium ${zone.active ? "" : "text-zinc-400 line-through dark:text-zinc-500"}`}
            >
              {zone.name}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">taxă:</span>
                <PriceCell
                  allowZero
                  priceBani={zone.feeBani}
                  onSave={(feeBani) => onPatchZone(zone.id, { feeBani })}
                />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">gratuit de la:</span>
                <PriceCell
                  allowZero
                  priceBani={zone.freeFromBani}
                  onSave={(freeFromBani) => onPatchZone(zone.id, { freeFromBani })}
                />
              </span>
              <AvailabilityToggle active={zone.active} busy={busyId === zone.id} onToggle={() => void toggle(zone)} />
            </span>
          </li>
        ))}
      </ul>

      <NewZoneForm onCreate={onCreateZone} />
    </div>
  );
}

function NewZoneForm({
  onCreate,
}: Readonly<{ onCreate: (input: { name: string; feeBani: number; freeFromBani: number }) => Promise<string | null> }>) {
  const [name, setName] = useState("");
  const [feeText, setFeeText] = useState("");
  const [freeFromText, setFreeFromText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeBani = parseLeiToBani(feeText);
  const freeFromBani = parseLeiToBani(freeFromText);
  const canSubmit = !busy && name.trim() !== "" && feeBani !== null && freeFromBani !== null;

  async function submit() {
    if (feeBani === null || freeFromBani === null) return;
    setBusy(true);
    setError(null);
    const failure = await onCreate({ name: name.trim(), feeBani, freeFromBani });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setName("");
    setFeeText("");
    setFreeFromText("");
  }

  const field =
    "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-bold">Zonă nouă</h2>
      {error && <p className="rounded-xl bg-red-100 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nume localitate"
          className={`${field} w-48`}
        />
        <input
          value={feeText}
          onChange={(event) => setFeeText(event.target.value)}
          placeholder="taxă (lei)"
          inputMode="decimal"
          className={`${field} w-28 tabular-nums`}
        />
        <input
          value={freeFromText}
          onChange={(event) => setFreeFromText(event.target.value)}
          placeholder="gratuit de la (lei)"
          inputMode="decimal"
          className={`${field} w-36 tabular-nums`}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Adaugă zona
        </button>
      </div>
    </div>
  );
}
