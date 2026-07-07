"use client";

/**
 * Coupons admin (006 Q4, admin-only): list all coupons incl. inactive/
 * expired, edit the value inline (unit depends on type: % vs lei),
 * activate/deactivate (never delete — past orders reference coupons via
 * RESTRICT FK and keep their snapshots anyway), create new. The code and the
 * validity window are fixed at creation — retire the code and make a new one
 * for a new campaign.
 */
import { useState } from "react";

import type { PatchFn } from "@/components/admin/CatalogCategoryBlock";
import { AvailabilityToggle } from "@/components/admin/AvailabilityToggle";
import { parseLeiToBani } from "@/components/admin/format";
import { PriceCell } from "@/components/admin/PriceCell";
import type { CouponRow, CouponType } from "@/components/admin/types";
import { RESTAURANT_TIMEZONE } from "@/lib/restaurant-config";

export const COUPON_TYPE_LABELS_RO: Record<CouponType, string> = {
  percent: "Procent",
  fixed: "Sumă fixă",
  free_delivery: "Livrare gratuită",
};

const dateFormat = new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeZone: RESTAURANT_TIMEZONE });

function windowLabel(coupon: CouponRow): string {
  const from = coupon.startsAt ? dateFormat.format(new Date(coupon.startsAt)) : null;
  const to = coupon.endsAt ? dateFormat.format(new Date(coupon.endsAt)) : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `de la ${from}`;
  if (to) return `până la ${to}`;
  return "fără limită de timp";
}

export interface NewCouponUiInput {
  code: string;
  type: CouponType;
  value: number | null;
  startsAt: string | null;
  endsAt: string | null;
}

interface CouponsTableProps {
  coupons: CouponRow[];
  onPatchCoupon: PatchFn;
  onCreateCoupon: (input: NewCouponUiInput) => Promise<string | null>;
}

export function CouponsTable({ coupons, onPatchCoupon, onCreateCoupon }: Readonly<CouponsTableProps>) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle(coupon: CouponRow) {
    setBusyId(coupon.id);
    setNotice(null);
    const error = await onPatchCoupon(coupon.id, { active: !coupon.active });
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

      {coupons.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Niciun cupon încă — adaugă primul mai jos.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {coupons.map((coupon) => (
            <li key={coupon.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <span className="min-w-32">
                <span
                  className={`font-mono font-semibold tracking-wide ${
                    coupon.active ? "" : "text-zinc-400 line-through dark:text-zinc-500"
                  }`}
                >
                  {coupon.code}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{windowLabel(coupon)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {COUPON_TYPE_LABELS_RO[coupon.type].toLowerCase()}:
                  </span>
                  {coupon.type === "fixed" && (
                    <PriceCell priceBani={coupon.value ?? 0} onSave={(value) => onPatchCoupon(coupon.id, { value })} />
                  )}
                  {coupon.type === "percent" && (
                    <PercentCell percent={coupon.value ?? 0} onSave={(value) => onPatchCoupon(coupon.id, { value })} />
                  )}
                  {coupon.type === "free_delivery" && <span className="font-semibold">taxa 0</span>}
                </span>
                <AvailabilityToggle
                  active={coupon.active}
                  busy={busyId === coupon.id}
                  onToggle={() => void toggle(coupon)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      <NewCouponForm onCreate={onCreateCoupon} />
    </div>
  );
}

/** Inline percent editor — integer 1–100, same interaction as PriceCell. */
function PercentCell({
  percent,
  onSave,
}: Readonly<{ percent: number; onSave: (value: number) => Promise<string | null> }>) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(String(percent));
          setInvalid(false);
          setEditing(true);
        }}
        className="rounded-lg px-2 py-0.5 text-sm font-semibold tabular-nums underline decoration-dotted underline-offset-4 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        title="Modifică procentul"
      >
        −{percent}%
      </button>
    );
  }

  async function save() {
    const value = /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
    if (value === null || value < 1 || value > 100) {
      setInvalid(true);
      return;
    }
    if (value === percent) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const error = await onSave(value);
    setBusy(false);
    if (error === null) setEditing(false);
    else setInvalid(true);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        inputMode="numeric"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") setEditing(false);
        }}
        className={`w-14 rounded-lg border px-2 py-0.5 text-sm tabular-nums dark:bg-zinc-950 ${
          invalid ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
        }`}
        aria-label="Procent reducere"
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

function NewCouponForm({ onCreate }: Readonly<{ onCreate: (input: NewCouponUiInput) => Promise<string | null> }>) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [valueText, setValueText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value =
    type === "free_delivery"
      ? null
      : type === "percent"
        ? /^\d{1,3}$/.test(valueText.trim()) && Number(valueText.trim()) >= 1 && Number(valueText.trim()) <= 100
          ? Number(valueText.trim())
          : null
        : parseLeiToBani(valueText);
  const codeOk = /^[A-Za-z0-9-]{3,32}$/.test(code.trim());
  const canSubmit = !busy && codeOk && (type === "free_delivery" || (value !== null && value > 0));

  async function submit() {
    setBusy(true);
    setError(null);
    // a whole end day counts: until 23:59:59 restaurant-local on the chosen date
    const failure = await onCreate({
      code: code.trim(),
      type,
      value,
      startsAt: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : null,
      endsAt: toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : null,
    });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setCode("");
    setValueText("");
    setFromDate("");
    setToDate("");
  }

  const field = "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-bold">Cupon nou</h2>
      {error && (
        <p className="rounded-xl bg-red-100 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="COD (ex. VARA10)"
          className={`${field} w-40 font-mono uppercase`}
        />
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as CouponType);
            setValueText("");
          }}
          className={field}
          aria-label="Tip reducere"
        >
          <option value="percent">Procent</option>
          <option value="fixed">Sumă fixă</option>
          <option value="free_delivery">Livrare gratuită</option>
        </select>
        {type !== "free_delivery" && (
          <input
            value={valueText}
            onChange={(event) => setValueText(event.target.value)}
            placeholder={type === "percent" ? "procent (%)" : "sumă (lei)"}
            inputMode={type === "percent" ? "numeric" : "decimal"}
            className={`${field} w-28 tabular-nums`}
          />
        )}
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          de la
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className={field}
            aria-label="Valabil de la"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          până la (inclusiv)
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className={field}
            aria-label="Valabil până la"
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Adaugă cuponul
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Fără date = valabil imediat și până la dezactivare. Clienții pot tasta codul cu litere mici sau mari.
      </p>
    </div>
  );
}
