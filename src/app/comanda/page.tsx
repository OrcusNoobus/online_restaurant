"use client";

/**
 * Checkout: mode (delivery/pickup), zone, schedule, guest data, payment,
 * T&C consent. Totals come from the server quote for the CHOSEN mode+zone;
 * placing the order re-validates everything server-side. Outside opening
 * hours the form is blocked client-side too (same pure schedule module).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart/cart-store";
import { useQuote } from "@/components/cart/useQuote";
import { formatBani } from "@/lib/money";
import {
  COUPON_REASON_MESSAGES_RO,
  type InvalidCartReason,
  type PlacedOrderView,
  type ZoneView,
} from "@/lib/quote-types";
import {
  DEFAULT_SCHEDULE_CONFIG,
  RESTAURANT_ADDRESS,
  RESTAURANT_PHONE,
  type ScheduleConfig,
} from "@/lib/restaurant-config";
import { formatMinutesAsTime, isOpenAt } from "@/lib/schedule";

type Mode = "delivery" | "pickup";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, removeLines, clear, couponCode, clearCoupon } = useCart();

  const [mode, setMode] = useState<Mode>("delivery");
  const [zones, setZones] = useState<ZoneView[] | null>(null);
  const [zoneSlug, setZoneSlug] = useState<string | undefined>(undefined);
  const [address, setAddress] = useState("");
  const [when, setWhen] = useState<"asap" | "scheduled">("asap");
  // live values arrive from GET /api/schedule; defaults render until then
  const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);
  const [pickupEstimate, setPickupEstimate] = useState<number>(
    DEFAULT_SCHEDULE_CONFIG.pickupEstimateOptionsMinutes[0],
  );
  const [scheduledTime, setScheduledTime] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState("cash");
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const open = isOpenAt(schedule, new Date());
  const openLabel = formatMinutesAsTime(schedule.openMinutes);
  const closeLabel = formatMinutesAsTime(schedule.closeMinutes);
  const earliestLabel = formatMinutesAsTime(schedule.earliestFulfillmentMinutes);

  const orderReasonMessages: Record<string, string> = {
    shop_closed: `Suntem închiși momentan. Program zilnic: ${openLabel}–${closeLabel}.`,
    schedule_out_of_hours: `Ora aleasă nu este disponibilă. Comenzile se onorează azi, între ${earliestLabel} și ${closeLabel}, cu timpul de pregătire inclus.`,
    payment_not_allowed_for_mode: "Metoda de plată aleasă nu este disponibilă pentru acest tip de comandă.",
    invalid_pickup_estimate: "Opțiunea de ridicare aleasă nu mai este disponibilă. Alege alta și reîncearcă.",
    // an invalid coupon at placement uses the same shared texts (006)
    ...COUPON_REASON_MESSAGES_RO,
  };

  const { quote, loading, failed, couponNotice } = useQuote({
    items,
    mode,
    zoneSlug: mode === "delivery" ? zoneSlug : undefined,
    couponCode,
    removeLines,
    clearCoupon,
  });

  // 010 T09: silent prefill for logged-in customers. 401 = guest → nothing
  // happens (FR3); on 200 we seed ONLY fields the visitor has not already
  // typed into (the response may arrive after typing started).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          customer: {
            firstName: string | null;
            lastName: string | null;
            phone: string | null;
            email: string;
            addressStreet: string | null;
            zoneSlug: string | null;
          };
        };
        const profile = body.customer;
        if (profile.firstName) setFirstName((current) => current || profile.firstName!);
        if (profile.lastName) setLastName((current) => current || profile.lastName!);
        if (profile.phone) setPhone((current) => current || profile.phone!);
        setEmail((current) => current || profile.email);
        if (profile.addressStreet) setAddress((current) => current || profile.addressStreet!);
        if (profile.zoneSlug) setZoneSlug((current) => current ?? profile.zoneSlug!);
      })
      .catch(() => {
        // prefill is best-effort; the form works exactly like for a guest
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/zones", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`zones failed: ${response.status}`);
        const body = (await response.json()) as { zones: ZoneView[] };
        setZones(body.zones);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setZones([]);
      });
    fetch("/api/schedule", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`schedule failed: ${response.status}`);
        const body = (await response.json()) as { schedule: ScheduleConfig };
        setSchedule(body.schedule);
        // the default selection may have been edited away in the admin panel
        setPickupEstimate((current) =>
          body.schedule.pickupEstimateOptionsMinutes.includes(current)
            ? current
            : body.schedule.pickupEstimateOptionsMinutes[0],
        );
      })
      .catch(() => {
        // defaults keep rendering; the server re-validates at placement anyway
      });
    return () => controller.abort();
  }, []);

  const paymentOptions = useMemo(
    () =>
      mode === "delivery"
        ? [
            { value: "cash", label: "Numerar la livrare" },
            { value: "card_delivery", label: "Card la livrare" },
          ]
        : [
            { value: "cash", label: "Numerar la restaurant" },
            { value: "card_restaurant", label: "Card la restaurant" },
          ],
    [mode],
  );

  // derived, not synced: when the mode flips and the stored method no longer
  // applies, fall back to cash without an effect
  const effectivePayment = paymentOptions.some(({ value }) => value === payment) ? payment : "cash";

  const zone = zones?.find((candidate) => candidate.slug === zoneSlug) ?? null;

  const formComplete =
    items.length > 0 &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    phone.trim() !== "" &&
    terms &&
    (mode === "pickup" || (zoneSlug !== undefined && address.trim() !== "")) &&
    (when === "asap" || scheduledTime !== "");

  async function submit() {
    if (!formComplete || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    let scheduledFor: string | null = null;
    if (when === "scheduled" && scheduledTime) {
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);
      scheduledFor = scheduled.toISOString();
    }

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          ...(mode === "delivery" ? { zoneSlug } : {}),
          items,
          customer: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim() === "" ? null : email.trim(),
          },
          addressStreet: mode === "delivery" ? address.trim() : null,
          notes: notes.trim() === "" ? null : notes.trim(),
          scheduledFor,
          ...(mode === "pickup" && when === "asap" ? { pickupEstimateMinutes: pickupEstimate } : {}),
          ...(couponCode ? { couponCode } : {}),
          paymentMethod: effectivePayment,
          termsAccepted: terms,
        }),
      });

      if (response.status === 201) {
        const order = (await response.json()) as PlacedOrderView;
        window.sessionStorage.setItem("rfd-last-order", JSON.stringify(order));
        clear();
        router.push("/comanda/confirmare");
        return;
      }

      const body = (await response.json()) as { error?: string; reasons?: InvalidCartReason[] };
      if (response.status === 422 && body.reasons?.length) {
        const messages = body.reasons.map(
          (reason) => orderReasonMessages[reason.code] ?? "Comanda nu a putut fi validată. Verifică datele.",
        );
        setSubmitError([...new Set(messages)].join(" "));
      } else if (response.status === 400) {
        setSubmitError("Unele date nu sunt valide. Verifică telefonul și adresa.");
      } else {
        setSubmitError("A apărut o eroare. Încearcă din nou.");
      }
    } catch {
      setSubmitError("Nu am putut trimite comanda. Verifică conexiunea și reîncearcă.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Finalizează comanda</h1>
          <Link href="/cos" className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ← Coș
          </Link>
        </header>

        {!open && (
          <p className="mt-4 rounded-xl bg-red-100 p-3 text-sm font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
            Suntem închiși momentan. Comenzile se pot plasa zilnic între {openLabel} și {closeLabel}.
          </p>
        )}

        {items.length === 0 ? (
          <div className="pt-12 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">Coșul este gol.</p>
            <Link href="/" className="mt-4 inline-block rounded-full bg-amber-600 px-6 py-2.5 font-semibold text-white">
              Vezi meniul
            </Link>
          </div>
        ) : (
          <form
            className="mt-6 space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold">Cum primești comanda?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "delivery", label: "Livrare" },
                    { value: "pickup", label: "Ridicare personală" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-300 p-3 text-sm font-medium has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950"
                  >
                    <input
                      type="radio"
                      name="mode"
                      className="accent-amber-600"
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {mode === "pickup" && (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Ridici comanda de la restaurant: {RESTAURANT_ADDRESS} · Telefon: {RESTAURANT_PHONE}.
                </p>
              )}
            </fieldset>

            {mode === "delivery" && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Adresa de livrare</legend>
                <select
                  value={zoneSlug ?? ""}
                  onChange={(event) => setZoneSlug(event.target.value || undefined)}
                  className={inputClass}
                  required
                >
                  <option value="">Alege localitatea…</option>
                  {(zones ?? []).map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Strada, numărul, bloc/scară/apartament"
                  className={inputClass}
                  required
                />
                {zone && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Livrare {zone.name}: {formatBani(zone.feeBani)} — gratuită la comenzi de la{" "}
                    {formatBani(zone.freeFromBani)}.
                  </p>
                )}
              </fieldset>
            )}

            <fieldset>
              <legend className="text-sm font-semibold">Când?</legend>
              <div className="mt-2 space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-300 p-3 text-sm has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950">
                  <input
                    type="radio"
                    name="when"
                    className="accent-amber-600"
                    checked={when === "asap"}
                    onChange={() => setWhen("asap")}
                  />
                  Cât mai curând posibil
                  <span className="ml-auto text-zinc-500 dark:text-zinc-400">
                    ~{mode === "delivery" ? schedule.deliveryEstimateMinutes : pickupEstimate} min
                  </span>
                </label>
                {mode === "pickup" && when === "asap" && (
                  <div className="flex gap-2 pl-4">
                    {schedule.pickupEstimateOptionsMinutes.map((minutes) => (
                      <label
                        key={minutes}
                        className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-300 px-3 py-1.5 text-sm has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950"
                      >
                        <input
                          type="radio"
                          name="pickup-estimate"
                          className="accent-amber-600"
                          checked={pickupEstimate === minutes}
                          onChange={() => setPickupEstimate(minutes)}
                        />
                        {minutes} min
                      </label>
                    ))}
                  </div>
                )}
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-300 p-3 text-sm has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950">
                  <input
                    type="radio"
                    name="when"
                    className="accent-amber-600"
                    checked={when === "scheduled"}
                    onChange={() => setWhen("scheduled")}
                  />
                  La o oră anume (azi)
                  <input
                    type="time"
                    min={earliestLabel}
                    max={closeLabel}
                    value={scheduledTime}
                    onChange={(event) => {
                      setScheduledTime(event.target.value);
                      setWhen("scheduled");
                    }}
                    className="ml-auto rounded-lg border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Datele tale</legend>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Prenume"
                  className={inputClass}
                  required
                />
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Nume de familie"
                  className={inputClass}
                  required
                />
              </div>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Telefon (07xx xxx xxx)"
                type="tel"
                className={inputClass}
                required
              />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="E-mail (opțional)"
                type="email"
                className={inputClass}
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Observații (opțional)"
                rows={2}
                className={inputClass}
              />
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">Metodă de plată</legend>
              <div className="mt-2 space-y-2">
                {paymentOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-300 p-3 text-sm has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950"
                  >
                    <input
                      type="radio"
                      name="payment"
                      className="accent-amber-600"
                      checked={effectivePayment === option.value}
                      onChange={() => setPayment(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {quote && (
              <dl className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
                  <dd className="font-semibold tabular-nums">{formatBani(quote.subtotalBani)}</dd>
                </div>
                {quote.sgrBani > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">Garanție SGR</dt>
                    <dd className="font-semibold tabular-nums">{formatBani(quote.sgrBani)}</dd>
                  </div>
                )}
                {mode === "delivery" && zoneSlug && (
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">Taxă de livrare</dt>
                    <dd className="font-semibold tabular-nums">
                      {quote.coupon?.type === "free_delivery" && quote.deliveryFeeBani > 0
                        ? "gratuită (cupon)"
                        : quote.deliveryFeeBani === 0
                          ? "gratuită"
                          : formatBani(quote.deliveryFeeBani)}
                    </dd>
                  </div>
                )}
                {quote.freeDeliveryGapBani > 0 && quote.coupon?.type !== "free_delivery" && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Mai adaugă {formatBani(quote.freeDeliveryGapBani)} și livrarea devine gratuită.
                  </p>
                )}
                {quote.coupon && quote.discountBani > 0 && quote.coupon.type !== "free_delivery" && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <dt>Reducere ({quote.coupon.code})</dt>
                    <dd className="font-semibold tabular-nums">−{formatBani(quote.discountBani)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-zinc-200 pt-2 text-base dark:border-zinc-700">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-bold tabular-nums">{formatBani(quote.totalBani)}</dd>
                </div>
              </dl>
            )}
            {couponNotice && (
              <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {couponNotice}
              </p>
            )}
            {mode === "delivery" && !zoneSlug && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Alege localitatea pentru a vedea taxa de livrare și totalul final.
              </p>
            )}
            {failed && (
              <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
                Nu am putut calcula totalul. Verifică conexiunea și reîncearcă.
              </p>
            )}

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={terms}
                onChange={(event) => setTerms(event.target.checked)}
                className="mt-0.5 accent-amber-600"
                required
              />
              <span>
                Sunt de acord cu{" "}
                <Link href="/termeni" className="underline" target="_blank">
                  Termenii și Condițiile
                </Link>{" "}
                și cu{" "}
                <Link href="/confidentialitate" className="underline" target="_blank">
                  Protecția datelor
                </Link>
                .
              </span>
            </label>

            {submitError && (
              <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={!formComplete || !open || submitting || loading || quote === null}
              className="w-full rounded-2xl bg-amber-600 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
            >
              {submitting ? "Se trimite…" : `Plasează comanda${quote ? ` · ${formatBani(quote.totalBani)}` : ""}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
