"use client";

/**
 * Conversation panel for the site assistant — bottom sheet on phones
 * (375px-first), floating card anchored above the FAB on larger screens.
 * Presentational: transcript + pending state come in as props, the send
 * handler goes out. Refusal/unavailable bubbles (with the restaurant phone)
 * arrive as ordinary error-role messages from useAssistant.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/components/chat/useAssistant";
import { formatBani } from "@/lib/money";
import type { PlacedOrderView } from "@/lib/quote-types";
import { RESTAURANT_ADDRESS } from "@/lib/restaurant-config";

/**
 * Minimal formatting for assistant text (Q13, owner 2026-07-06): only
 * `**bold**` becomes <strong>; everything else stays plain text (React
 * escapes it) and line breaks / `- ` lists read fine via pre-wrap. No
 * Markdown dependency — the system prompt caps what the model may emit.
 */
function renderAssistantText(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface ChatPanelProps {
  messages: ChatMessage[];
  pending: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

/** Same estimate wording as the checkout confirmation page. */
function fulfillmentLine(order: PlacedOrderView): string {
  const time = order.scheduledFor
    ? new Date(order.scheduledFor).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })
    : null;
  if (order.mode === "delivery") {
    return time ? `O livrăm azi la ${time}.` : `Timp estimat de livrare: ~${order.estimateMinutes} minute.`;
  }
  return time
    ? `Te așteptăm azi la ${time} la ${RESTAURANT_ADDRESS}.`
    : `Comanda este gata în ~${order.estimateMinutes} minute la ${RESTAURANT_ADDRESS}.`;
}

function PlacedOrderCard({ order }: { order: PlacedOrderView }) {
  return (
    <div className="mt-2 space-y-1 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
      <p className="font-semibold">✅ Comanda {order.orderNumber} a fost plasată!</p>
      <p>{fulfillmentLine(order)}</p>
      <p>
        Total de plată: <strong className="tabular-nums">{formatBani(order.totalBani)}</strong> — plata la{" "}
        {order.mode === "delivery" ? "livrare" : "restaurant"}.
      </p>
    </div>
  );
}

const BUBBLE_STYLES: Record<ChatMessage["role"], string> = {
  user: "ml-auto rounded-br-md bg-amber-600 text-white",
  assistant: "mr-auto rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
  error:
    "mr-auto rounded-bl-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
};

export function ChatPanel({ messages, pending, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // lock body scroll while the panel is open — same pattern as OptionsSheet
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // keep the newest message (or the typing indicator) in view
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, pending]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.trim().length === 0 || pending) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:justify-start sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Asistent Royal"
    >
      <button aria-label="Închide" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-[85dvh] w-full flex-col rounded-t-3xl bg-white shadow-xl dark:bg-zinc-900 sm:h-[37.5rem] sm:max-h-[calc(100dvh-2.5rem)] sm:w-96 sm:rounded-3xl">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            <span aria-hidden>💬</span> Asistent Royal
          </h2>
          <button
            onClick={onClose}
            className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Închide
          </button>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${BUBBLE_STYLES.assistant}`}>
              Salut! 👋 Sunt asistentul Royal. Întreabă-mă orice despre meniu, ingrediente sau alergeni — sau
              spune-mi ce ai dori să comanzi.
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${BUBBLE_STYLES[message.role]}`}>
              <p className="whitespace-pre-wrap">
                {message.role === "user" ? message.text : renderAssistantText(message.text)}
              </p>
              {message.placedOrder && <PlacedOrderCard order={message.placedOrder} />}
            </div>
          ))}
          {pending && (
            <div
              className="mr-auto flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3 dark:bg-zinc-800"
              aria-label="Asistentul scrie"
            >
              <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={500}
              autoFocus
              placeholder="Scrie un mesaj…"
              aria-label="Mesajul tău"
              className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white active:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
            >
              Trimite
            </button>
          </form>
          {/* place_order sends termsAccepted: true — the same legal texts as the checkout (06-contracts) */}
          <p className="mt-2 text-center text-[11px] leading-4 text-zinc-400 dark:text-zinc-500">
            Comanda prin chat presupune acordul cu{" "}
            <Link href="/termeni" className="underline" target="_blank">
              Termenii și Condițiile
            </Link>{" "}
            și{" "}
            <Link href="/confidentialitate" className="underline" target="_blank">
              Protecția datelor
            </Link>
            .
          </p>
        </footer>
      </div>
    </div>
  );
}
