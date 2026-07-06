"use client";

/**
 * Login/signup for customers (005 T09) — rendered by /cont when anonymous.
 * The Google button exists ONLY when the server says the provider is
 * configured (boolean prop — no env values reach the client, D8). After a
 * successful auth the page refreshes so the server component re-renders with
 * the session.
 */
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email sau parolă greșită.",
  too_many_attempts: "Prea multe încercări. Așteaptă câteva minute și încearcă din nou.",
  email_taken: "Există deja un cont cu acest email. Intră în cont sau folosește alt email.",
};

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 " +
  "focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const LABEL_CLASS = "mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function AuthPanel({ googleEnabled, googleFailed }: { googleEnabled: boolean; googleFailed: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(
    googleFailed ? "Autentificarea cu Google nu a reușit. Încearcă din nou sau folosește email + parolă." : null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const isSignup = mode === "signup";
      const response = await fetch(isSignup ? "/api/account/register" : "/api/account/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isSignup
            ? {
                email,
                password,
                firstName,
                lastName,
                ...(phone.trim() === "" ? {} : { phone: phone.trim() }),
                termsAccepted: terms,
              }
            : { email, password },
        ),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const body = (await response.json()) as { error?: string };
      if (body.error === "validation") {
        setError(
          mode === "signup"
            ? "Verifică datele: email valid, parolă de minim 8 caractere, nume complet și acordul pentru termeni."
            : "Verifică emailul și parola introduse.",
        );
      } else {
        setError(ERROR_MESSAGES[body.error ?? ""] ?? "A apărut o eroare. Încearcă din nou.");
      }
    } catch {
      setError("Nu am putut contacta serverul. Verifică conexiunea.");
    } finally {
      setSubmitting(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-xl py-2 text-sm font-semibold ${
      active
        ? "bg-amber-600 text-white"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
    }`;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={tabClass(mode === "login")}
          onClick={() => setMode("login")}
        >
          Intră în cont
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={tabClass(mode === "signup")}
          onClick={() => setMode("signup")}
        >
          Creează cont
        </button>
      </div>

      {mode === "signup" && (
        <>
          <label className={LABEL_CLASS}>
            Prenume
            <input
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              required
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
              required
              className={INPUT_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Telefon (opțional)
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              placeholder="07xxxxxxxx"
              className={INPUT_CLASS}
            />
          </label>
        </>
      )}

      <label className={LABEL_CLASS}>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          required
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Parolă
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          className={INPUT_CLASS}
        />
      </label>

      {mode === "signup" && (
        <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={terms}
            onChange={(event) => setTerms(event.target.checked)}
            required
            className="mt-0.5 h-4 w-4 accent-amber-600"
          />
          <span>
            Sunt de acord cu{" "}
            <a href="/termeni" className="font-medium text-amber-700 underline dark:text-amber-400">
              Termenii și condițiile
            </a>{" "}
            și cu{" "}
            <a href="/confidentialitate" className="font-medium text-amber-700 underline dark:text-amber-400">
              Politica de confidențialitate
            </a>
            .
          </span>
        </label>
      )}

      {mode === "login" && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Ai uitat parola? {googleEnabled ? "Intră cu Google (același email) sau sună-ne" : "Sună-ne"} la
          restaurant și o rezolvăm.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-2xl bg-amber-600 py-3 font-semibold text-white active:bg-amber-700 disabled:opacity-60"
      >
        {submitting ? "Se verifică…" : mode === "signup" ? "Creează contul" : "Intră în cont"}
      </button>

      {googleEnabled && (
        <>
          <div className="mt-4 flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            sau
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>
          {/* full navigation on purpose: the flow is a chain of redirects */}
          <a
            href="/api/account/google/start"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white py-3 font-semibold text-zinc-800 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.03c2.2-2.05 3.5-5.05 3.5-8.6"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 5.9-1.05 7.9-2.9l-3.75-2.9c-1 .7-2.35 1.2-4.1 1.2-3.15 0-5.8-2.05-6.75-4.95l-.14.01-3.63 2.8-.05.13C3.4 21.3 7.4 24 12 24"
              />
              <path
                fill="#FBBC05"
                d="M5.25 14.45a7.3 7.3 0 0 1-.4-2.4c0-.85.15-1.65.4-2.4l-.01-.16-3.68-2.85-.12.06A11.9 11.9 0 0 0 .1 12c0 1.95.45 3.75 1.3 5.35l3.85-2.9"
              />
              <path
                fill="#EB4335"
                d="M12 4.75c2.2 0 3.7.95 4.55 1.75l3.35-3.25C17.85 1.25 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.65l3.85 2.95C6.2 6.8 8.85 4.75 12 4.75"
              />
            </svg>
            Continuă cu Google
          </a>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Prin continuarea cu Google accepți{" "}
            <a href="/termeni" className="underline">
              termenii
            </a>{" "}
            și{" "}
            <a href="/confidentialitate" className="underline">
              politica de confidențialitate
            </a>
            .
          </p>
        </>
      )}
    </form>
  );
}
