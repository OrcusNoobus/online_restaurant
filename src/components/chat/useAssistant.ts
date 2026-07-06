"use client";

/**
 * Chat client over the POST /api/assistant contract (008 06-contracts).
 * conversationId + transcript live in sessionStorage for the tab's browsing
 * session (Q8 — closing the tab starts a fresh conversation); the request
 * carries the SITE cart and the response cart is written back verbatim into
 * the cart store, so the shop and the chat share one cart (Q11). Refusals
 * (422) and outages (503/network/timeout) become error-role bubbles with the
 * restaurant phone — the polite degradation from 03-research D3.
 */
import { useState } from "react";

import { useCart } from "@/components/cart/cart-store";
import type { CartItem } from "@/lib/cart";
import type { PlacedOrderView } from "@/lib/quote-types";
import { RESTAURANT_PHONE } from "@/lib/restaurant-config";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  /** Present on the assistant message of a turn that placed an order. */
  placedOrder?: PlacedOrderView | null;
}

interface StoredChat {
  conversationId: string | null;
  messages: ChatMessage[];
}

const STORAGE_KEY = "rfd-chat-v1";
const EMPTY_CHAT: StoredChat = { conversationId: null, messages: [] };

/** The tool loop runs server-side within the request — allow it several LLM rounds. */
const REQUEST_TIMEOUT_MS = 90_000;

const UNAVAILABLE_TEXT = `Asistentul nu este disponibil momentan. Ne poți suna oricând la ${RESTAURANT_PHONE}.`;

/** The 422 refusal codes of the contract, as customer-facing Romanian. */
const LIMIT_TEXTS: Record<string, string> = {
  message_too_long: "Mesajul este prea lung — te rugăm să îl scurtezi (maxim 500 de caractere).",
  conversation_limit: `Această conversație a atins limita de mesaje. Pentru comenzi, sună-ne la ${RESTAURANT_PHONE}.`,
  daily_limit: `Ai atins limita zilnică de mesaje. Ne poți suna oricând la ${RESTAURANT_PHONE}.`,
};

/** Defensive parse — never trust old shapes left in sessionStorage. */
function readStoredChat(): StoredChat {
  if (typeof window === "undefined") return EMPTY_CHAT;
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "");
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as StoredChat).messages)) {
      return EMPTY_CHAT;
    }
    const { conversationId, messages } = parsed as StoredChat;
    return {
      conversationId: typeof conversationId === "string" ? conversationId : null,
      messages: messages.filter(
        (message): message is ChatMessage =>
          typeof message === "object" &&
          message !== null &&
          typeof message.id === "string" &&
          typeof message.text === "string" &&
          (message.role === "user" || message.role === "assistant" || message.role === "error"),
      ),
    };
  } catch {
    return EMPTY_CHAT;
  }
}

export interface AssistantApi {
  messages: ChatMessage[];
  pending: boolean;
  send: (text: string) => void;
}

export function useAssistant(): AssistantApi {
  const { items, replace } = useCart();
  const [chat, setChat] = useState<StoredChat>(readStoredChat);
  const [pending, setPending] = useState(false);

  function push(next: StoredChat): void {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setChat(next);
  }

  function send(text: string): void {
    const message = text.trim();
    if (message.length === 0 || pending) return;

    // optimistic user bubble; `sent` (not state) is the base for the reply append
    const sent: StoredChat = {
      conversationId: chat.conversationId,
      messages: [...chat.messages, { id: crypto.randomUUID(), role: "user", text: message }],
    };
    push(sent);
    setPending(true);

    fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        ...(chat.conversationId ? { conversationId: chat.conversationId } : {}),
        message,
        cart: items.map(({ productId, variantId, quantity, toppingIds }) => ({
          productId,
          variantId,
          quantity,
          toppingIds,
        })),
      }),
    })
      .then(async (response) => {
        if (response.ok) {
          const body = (await response.json()) as {
            conversationId: string;
            reply: string;
            cart: CartItem[];
            placedOrder: PlacedOrderView | null;
          };
          replace(body.cart);
          push({
            // unknown/expired ids come back as a fresh conversation — adopt it (06-contracts)
            conversationId: body.conversationId,
            messages: [
              ...sent.messages,
              { id: crypto.randomUUID(), role: "assistant", text: body.reply, placedOrder: body.placedOrder },
            ],
          });
          return;
        }
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        const refusal = response.status === 422 && errorBody?.error ? LIMIT_TEXTS[errorBody.error] : undefined;
        push({
          ...sent,
          messages: [...sent.messages, { id: crypto.randomUUID(), role: "error", text: refusal ?? UNAVAILABLE_TEXT }],
        });
      })
      .catch(() => {
        push({
          ...sent,
          messages: [...sent.messages, { id: crypto.randomUUID(), role: "error", text: UNAVAILABLE_TEXT }],
        });
      })
      .finally(() => setPending(false));
  }

  return { messages: chat.messages, pending, send };
}
