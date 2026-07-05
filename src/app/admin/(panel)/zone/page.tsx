"use client";

/**
 * Delivery zones page (003 spec FR8, Q9 — admin only; the nav hides it for
 * staff, the API answers 403 anyway). Edits apply from the next cart quote.
 */
import { useCallback, useEffect, useState } from "react";

import { ZonesTable } from "@/components/admin/ZonesTable";
import type { ZoneRow } from "@/components/admin/types";

const ERROR_MESSAGES_RO: Record<string, string> = {
  name_taken: "Există deja o zonă cu acest nume.",
  forbidden_role: "Doar administratorul poate modifica zonele.",
  not_found: "Zona nu a fost găsită — reîncarcă pagina.",
  validation: "Date invalide — verifică valorile introduse.",
};

export default function AdminZonesPage() {
  const [zones, setZones] = useState<ZoneRow[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/zones", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (response.status === 403) {
      setPageError("Doar administratorul are acces la zonele de livrare.");
      return;
    }
    if (!response.ok) {
      setPageError("Nu am putut încărca zonele. Reîncarcă pagina.");
      return;
    }
    setZones(((await response.json()) as { zones: ZoneRow[] }).zones);
    setPageError(null);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })().catch(() => setPageError("Nu am putut încărca zonele. Reîncarcă pagina."));
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
        <h1 className="text-2xl font-bold tracking-tight">Zone de livrare</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Taxa se aplică sub prag; de la prag în sus livrarea e gratuită. Modificările se aplică de la următorul
          calcul de coș. Zonele folosite de comenzi vechi se dezactivează, nu se șterg.
        </p>
      </div>

      {pageError && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{pageError}</p>
      )}
      {!zones && !pageError && <p className="text-sm text-zinc-500 dark:text-zinc-400">Se încarcă…</p>}

      {zones && (
        <ZonesTable
          zones={zones}
          onPatchZone={(id, patch) => mutate(`/api/admin/zones/${id}`, "PATCH", patch)}
          onCreateZone={(input) => mutate("/api/admin/zones", "POST", { ...input })}
        />
      )}
    </div>
  );
}
