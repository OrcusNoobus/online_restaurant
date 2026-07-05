"use client";

/**
 * Schedule + estimates page (003 spec Q10 — admin only). One typed settings
 * row; a save applies to the very next checkout request (no cache, FR9).
 */
import { useCallback, useEffect, useState } from "react";

import { SettingsForm } from "@/components/admin/SettingsForm";
import type { SettingsPayload, SettingsUpdateUi } from "@/components/admin/types";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (response.status === 403) {
      setPageError("Doar administratorul are acces la setări.");
      return;
    }
    if (!response.ok) {
      setPageError("Nu am putut încărca setările. Reîncarcă pagina.");
      return;
    }
    setSettings(((await response.json()) as { settings: SettingsPayload }).settings);
    setPageError(null);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })().catch(() => setPageError("Nu am putut încărca setările. Reîncarcă pagina."));
  }, [load]);

  const save = useCallback(async (update: SettingsUpdateUi): Promise<string | null> => {
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return "Sesiune expirată.";
      }
      if (response.ok) {
        setSettings(((await response.json()) as { settings: SettingsPayload }).settings);
        return null;
      }
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (payload?.error === "forbidden_role") return "Doar administratorul poate modifica setările.";
      return "Salvarea nu a reușit — verifică valorile (închiderea după deschidere, prima onorare după deschidere).";
    } catch {
      return "Eroare de rețea. Verifică conexiunea și reîncearcă.";
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Setări program și estimări</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Programul controlează când se pot plasa comenzi; estimările apar la checkout. Se aplică imediat.
        </p>
      </div>

      {pageError && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{pageError}</p>
      )}
      {!settings && !pageError && <p className="text-sm text-zinc-500 dark:text-zinc-400">Se încarcă…</p>}

      {/* no key on purpose: remounting on each save would wipe the form's
          success/error notice; the form seeds from props once, on mount */}
      {settings && <SettingsForm settings={settings} onSave={save} />}
    </div>
  );
}
