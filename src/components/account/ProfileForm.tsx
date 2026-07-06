"use client";

/**
 * Delivery profile editor (005 T09, Q2/D-b): the guest-checkout fields, saved
 * on the account for prefill. Email is shown but NOT editable (v1 — it is the
 * login identifier). Zones come from the same public endpoint the checkout
 * uses.
 */
import { useEffect, useState } from "react";

import type { CustomerView } from "@/lib/account-schemas";
import type { ZoneView } from "@/lib/quote-types";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 " +
  "focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const LABEL_CLASS = "mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function ProfileForm({ customer }: { customer: CustomerView }) {
  const [firstName, setFirstName] = useState(customer.firstName ?? "");
  const [lastName, setLastName] = useState(customer.lastName ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [addressStreet, setAddressStreet] = useState(customer.addressStreet ?? "");
  const [zoneSlug, setZoneSlug] = useState(customer.zoneSlug ?? "");
  const [zones, setZones] = useState<ZoneView[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/zones", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`zones failed: ${response.status}`);
        const body = (await response.json()) as { zones: ZoneView[] };
        setZones(body.zones);
      })
      .catch(() => {
        // the select simply stays with the current value
      });
    return () => controller.abort();
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim() === "" ? undefined : firstName.trim(),
          lastName: lastName.trim() === "" ? undefined : lastName.trim(),
          phone: phone.trim() === "" ? null : phone.trim(),
          addressStreet: addressStreet.trim() === "" ? null : addressStreet.trim(),
          zoneSlug: zoneSlug === "" ? null : zoneSlug,
        }),
      });
      if (response.ok) {
        const body = (await response.json()) as { customer: CustomerView };
        setPhone(body.customer.phone ?? "");
        setMessage({ kind: "ok", text: "Profil salvat. Datele se vor precompleta la comandă." });
        return;
      }
      const body = (await response.json()) as { error?: string };
      setMessage({
        kind: "error",
        text:
          body.error === "unknown_zone"
            ? "Zona aleasă nu mai este disponibilă."
            : "Verifică datele introduse (telefonul în formatul 07xxxxxxxx).",
      });
    } catch {
      setMessage({ kind: "error", text: "Nu am putut contacta serverul. Încearcă din nou." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-bold tracking-tight">Profilul meu</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Cont: <span className="font-medium text-zinc-700 dark:text-zinc-300">{customer.email}</span>
        {customer.hasGoogle ? " · conectat cu Google" : ""}
      </p>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <label className={LABEL_CLASS}>
          Prenume
          <input
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          Nume
          <input
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <label className={LABEL_CLASS}>
        Telefon
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          placeholder="07xxxxxxxx"
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Adresă de livrare
        <input
          type="text"
          value={addressStreet}
          onChange={(event) => setAddressStreet(event.target.value)}
          autoComplete="street-address"
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Localitate / zonă
        <select value={zoneSlug} onChange={(event) => setZoneSlug(event.target.value)} className={INPUT_CLASS}>
          <option value="">— alege zona —</option>
          {zones.map((zone) => (
            <option key={zone.slug} value={zone.slug}>
              {zone.name}
            </option>
          ))}
          {zoneSlug !== "" && !zones.some((zone) => zone.slug === zoneSlug) && (
            <option value={zoneSlug}>{zoneSlug}</option>
          )}
        </select>
      </label>

      {message && (
        <p
          role="alert"
          className={`mt-4 rounded-xl p-3 text-sm ${
            message.kind === "ok"
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-5 w-full rounded-2xl bg-amber-600 py-3 font-semibold text-white active:bg-amber-700 disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {saving ? "Se salvează…" : "Salvează profilul"}
      </button>
    </section>
  );
}
