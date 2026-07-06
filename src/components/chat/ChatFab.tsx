"use client";

/**
 * Floating chat button + panel mount. Shop pages only: hidden on /admin and
 * on /comanda, where checkout already started (Q8). Bottom-LEFT — the cart
 * FAB owns bottom-right. Whether the assistant is configured at all is
 * decided server-side in layout.tsx (ANTHROPIC_API_KEY absent → this never
 * renders). The hook lives here, not in the panel, so the transcript
 * survives closing and reopening the panel.
 */
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { useAssistant } from "@/components/chat/useAssistant";

export function ChatFab() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const assistant = useAssistant();

  if (pathname.startsWith("/admin") || pathname.startsWith("/comanda")) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Deschide asistentul"
        className="fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-2xl shadow-lg active:bg-amber-700"
      >
        <span aria-hidden>💬</span>
      </button>
    );
  }

  return (
    <ChatPanel
      messages={assistant.messages}
      pending={assistant.pending}
      onSend={assistant.send}
      onClose={() => setOpen(false)}
    />
  );
}
