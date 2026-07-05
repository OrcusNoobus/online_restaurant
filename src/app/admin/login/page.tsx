"use client";

/**
 * Public staff login — deliberately OUTSIDE the (panel) route group so the
 * protected shell (session check, nav) never wraps it; the proxy passes
 * /admin/login through explicitly (003 plan, review point 3).
 */
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Utilizator sau parolă greșită.",
  too_many_attempts: "Prea multe încercări. Așteaptă câteva minute și încearcă din nou.",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }
      const body = (await response.json()) as { error?: string };
      setError(ERROR_MESSAGES[body.error ?? ""] ?? "A apărut o eroare. Încearcă din nou.");
    } catch {
      setError("Nu am putut contacta serverul. Verifică conexiunea.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Panou Royal</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Autentificare personal restaurant</p>

        <label className="mt-6 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Utilizator
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Parolă
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-2xl bg-amber-600 py-3 font-semibold text-white active:bg-amber-700 disabled:opacity-60"
        >
          {submitting ? "Se verifică…" : "Intră în panou"}
        </button>
      </form>
    </div>
  );
}
