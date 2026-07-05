"use client";

/**
 * Visible sound state for the new-order alert (003 plan risk: a browser that
 * blocks audio must degrade LOUDLY, not silently). Three states: on / off /
 * blocked-until-click. The page owns the Web Audio logic.
 */
export type SoundState = "on" | "off" | "blocked";

const LABELS: Record<SoundState, string> = {
  on: "🔔 Sunet pornit",
  off: "🔕 Sunet oprit",
  blocked: "⚠️ Sunet blocat — apasă",
};

export function SoundToggle({ state, onToggle }: Readonly<{ state: SoundState; onToggle: () => void }>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={state === "on"}
      className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm font-medium ${
        state === "blocked"
          ? "border-red-400 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
          : state === "on"
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      }`}
    >
      {LABELS[state]}
    </button>
  );
}
