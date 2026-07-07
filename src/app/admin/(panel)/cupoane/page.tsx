"use client";

/**
 * Coupons page (006 Q4 — admin only; the nav hides it for staff, the API
 * answers 403 anyway). Definitions apply from the next cart quote; placed
 * orders keep their snapshots.
 */
import { useCallback, useEffect, useState } from "react";

import { CouponsTable } from "@/components/admin/CouponsTable";
import type { CouponRow } from "@/components/admin/types";

const ERROR_MESSAGES_RO: Record<string, string> = {
  code_taken: "Există deja un cupon cu acest cod.",
  invalid_value_for_type: "Valoarea nu se potrivește cu tipul ales (procent 1–100, sumă în lei, fără valoare la livrare gratuită).",
  invalid_window: "Data de început trebuie să fie înaintea datei de sfârșit.",
  forbidden_role: "Doar administratorul poate modifica cupoanele.",
  not_found: "Cuponul nu a fost găsit — reîncarcă pagina.",
  validation: "Date invalide — codul are 3–32 de caractere (litere, cifre, liniuță).",
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/coupons", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (response.status === 403) {
      setPageError("Doar administratorul are acces la cupoane.");
      return;
    }
    if (!response.ok) {
      setPageError("Nu am putut încărca cupoanele. Reîncarcă pagina.");
      return;
    }
    setCoupons(((await response.json()) as { coupons: CouponRow[] }).coupons);
    setPageError(null);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })().catch(() => setPageError("Nu am putut încărca cupoanele. Reîncarcă pagina."));
  }, [refresh]);

  const mutate = useCallback(
    async (path: string, method: "PATCH" | "POST", body: Record<string, unknown>): Promise<string | null> => {
      try {
        const response = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.status === 401) {
          window.location.assign("/admin/login");
          return "Sesiune expirată.";
        }
        if (response.ok) {
          await refresh();
          return null;
        }
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        return (payload?.error && ERROR_MESSAGES_RO[payload.error]) ?? "Modificarea nu a reușit. Reîncearcă.";
      } catch {
        return "Eroare de rețea. Verifică conexiunea și reîncearcă.";
      }
    },
    [refresh],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cupoane de reducere</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Reducerea se aplică la valoarea produselor (garanția SGR și taxa de livrare rămân neatinse; «livrare
          gratuită» anulează doar taxa). Un cupon folosit de comenzi vechi se dezactivează, nu se șterge — comenzile
          plasate își păstrează reducerea.
        </p>
      </div>

      {pageError && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{pageError}</p>
      )}
      {!coupons && !pageError && <p className="text-sm text-zinc-500 dark:text-zinc-400">Se încarcă…</p>}

      {coupons && (
        <CouponsTable
          coupons={coupons}
          onPatchCoupon={(id, patch) => mutate(`/api/admin/coupons/${id}`, "PATCH", patch)}
          onCreateCoupon={(input) =>
            mutate("/api/admin/coupons", "POST", {
              code: input.code,
              type: input.type,
              ...(input.value !== null ? { value: input.value } : {}),
              ...(input.startsAt !== null ? { startsAt: input.startsAt } : {}),
              ...(input.endsAt !== null ? { endsAt: input.endsAt } : {}),
            })
          }
        />
      )}
    </div>
  );
}
