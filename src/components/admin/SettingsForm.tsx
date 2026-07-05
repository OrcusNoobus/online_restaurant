"use client";

/**
 * Schedule + estimates form (003 spec Q9/Q10, admin-only). Minutes-of-day in
 * the DB ↔ HH:MM time inputs here; pickup options as a comma list. Client
 * checks mirror the zod/CHECK rules (close after open, earliest ≥ open) —
 * the server stays authoritative. Changes apply to the very next checkout.
 */
import { useState } from "react";

import type { SettingsPayload, SettingsUpdateUi } from "@/components/admin/types";

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parsePickupOptions(text: string): number[] | null {
  const parts = text.split(",").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0 || parts.length > 10) return null;
  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value <= 0) return null;
    values.push(value);
  }
  return values;
}

interface SettingsFormProps {
  settings: SettingsPayload;
  onSave: (update: SettingsUpdateUi) => Promise<string | null>;
}

export function SettingsForm({ settings, onSave }: Readonly<SettingsFormProps>) {
  const [openTime, setOpenTime] = useState(minutesToTime(settings.openMinutes));
  const [closeTime, setCloseTime] = useState(minutesToTime(settings.closeMinutes));
  const [earliestTime, setEarliestTime] = useState(minutesToTime(settings.earliestFulfillmentMinutes));
  const [deliveryEstimate, setDeliveryEstimate] = useState(String(settings.deliveryEstimateMinutes));
  const [pickupOptions, setPickupOptions] = useState(settings.pickupEstimateOptionsMinutes.join(", "));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function validate(): { update: SettingsUpdateUi } | { error: string } {
    const openMinutes = timeToMinutes(openTime);
    const closeMinutes = timeToMinutes(closeTime);
    const earliestFulfillmentMinutes = timeToMinutes(earliestTime);
    if (openMinutes === null || closeMinutes === null || earliestFulfillmentMinutes === null) {
      return { error: "Orele trebuie completate în formatul HH:MM." };
    }
    if (closeMinutes <= openMinutes) return { error: "Ora de închidere trebuie să fie după deschidere." };
    if (earliestFulfillmentMinutes < openMinutes) {
      return { error: "Prima onorare nu poate fi înainte de deschidere." };
    }
    const deliveryEstimateMinutes = Number(deliveryEstimate);
    if (!Number.isInteger(deliveryEstimateMinutes) || deliveryEstimateMinutes <= 0) {
      return { error: "Estimarea de livrare trebuie să fie un număr întreg de minute (> 0)." };
    }
    const pickupEstimateOptionsMinutes = parsePickupOptions(pickupOptions);
    if (pickupEstimateOptionsMinutes === null) {
      return { error: "Opțiunile de ridicare: numere întregi de minute separate prin virgulă (ex.: 15, 25)." };
    }
    return {
      update: { openMinutes, closeMinutes, earliestFulfillmentMinutes, deliveryEstimateMinutes, pickupEstimateOptionsMinutes },
    };
  }

  async function submit() {
    const result = validate();
    if ("error" in result) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setBusy(true);
    setNotice(null);
    const failure = await onSave(result.update);
    setBusy(false);
    setNotice(
      failure
        ? { kind: "error", text: failure }
        : { kind: "ok", text: "Salvat. Valorile se aplică de la următoarea comandă." },
    );
  }

  const field =
    "mt-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950";
  const label = "block text-xs font-medium text-zinc-600 dark:text-zinc-300";

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {notice && (
        <p
          className={`rounded-xl p-3 text-sm ${
            notice.kind === "ok"
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Deschidere
          <input type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} className={field} />
        </label>
        <label className={label}>
          Închidere
          <input type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} className={field} />
        </label>
        <label className={label}>
          Prima onorare
          <input
            type="time"
            value={earliestTime}
            onChange={(event) => setEarliestTime(event.target.value)}
            className={field}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Estimare livrare (minute)
          <input
            inputMode="numeric"
            value={deliveryEstimate}
            onChange={(event) => setDeliveryEstimate(event.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          Opțiuni ridicare (minute, separate prin virgulă)
          <input
            value={pickupOptions}
            onChange={(event) => setPickupOptions(event.target.value)}
            placeholder="15, 25"
            className={field}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Salvează setările
      </button>
    </div>
  );
}
