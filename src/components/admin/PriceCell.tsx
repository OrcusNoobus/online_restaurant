"use client";

/**
 * Editable price cell (admin only): shows lei, edits as "37,50", saves
 * integer bani through the page's callback. Invalid text never leaves the
 * cell — money is integer bani everywhere (ARCHITECTURE.md).
 */
import { useState } from "react";

import { formatBani } from "@/lib/money";

import { baniToLeiInput, parseLeiToBani } from "@/components/admin/format";

interface PriceCellProps {
  priceBani: number;
  /** Topping prices may be 0 ("inclus"); variant prices must stay > 0. */
  allowZero?: boolean;
  /** Resolves with an error message (RO) or null on success. */
  onSave: (priceBani: number) => Promise<string | null>;
}

export function PriceCell({ priceBani, allowZero = false, onSave }: Readonly<PriceCellProps>) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(baniToLeiInput(priceBani));
          setInvalid(false);
          setEditing(true);
        }}
        className="rounded-lg px-2 py-0.5 text-sm font-semibold tabular-nums underline decoration-dotted underline-offset-4 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        title="Modifică prețul"
      >
        {formatBani(priceBani)}
      </button>
    );
  }

  async function save() {
    const bani = parseLeiToBani(text);
    if (bani === null || (!allowZero && bani <= 0)) {
      setInvalid(true);
      return;
    }
    if (bani === priceBani) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const error = await onSave(bani);
    setBusy(false);
    if (error === null) setEditing(false);
    else setInvalid(true);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") setEditing(false);
        }}
        className={`w-20 rounded-lg border px-2 py-0.5 text-sm tabular-nums dark:bg-zinc-950 ${
          invalid ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
        }`}
        aria-label="Preț în lei"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-lg bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        OK
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={busy}
        className="rounded-lg px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        ✕
      </button>
    </span>
  );
}
