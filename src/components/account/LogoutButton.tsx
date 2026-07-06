"use client";

/** Logout (005 T09, FR2) — the server deletes the session row, then the page re-renders as anonymous. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/account/logout", { method: "POST" });
    } catch {
      // even if the network call failed, refresh — the server state decides
    } finally {
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 active:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:active:bg-zinc-800"
    >
      {busy ? "Se deloghează…" : "Deloghează-mă"}
    </button>
  );
}
