"use client";

/** Ends the session server-side, then lands on the login page. */
export function LogoutButton() {
  async function handleLogout() {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      // full navigation, not router.push — the layout must re-run its session check
      window.location.href = "/admin/login";
    }
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 active:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:active:bg-zinc-800"
    >
      Ieși
    </button>
  );
}
