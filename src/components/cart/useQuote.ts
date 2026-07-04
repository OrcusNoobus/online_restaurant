"use client";

/**
 * Re-quotes the cart on every change: the server is the only price engine.
 * Stale lines (deactivated products/toppings, changed menu) are removed from
 * the client cart and reported so the customer sees WHY something vanished.
 * `loading` is derived (requestKey vs answered key) — no sync setState in effects.
 */
import { useEffect, useMemo, useState } from "react";

import { type CartItem, cartLineKey } from "@/lib/cart";
import { type InvalidCartReason, LINE_REASON_CODES, type QuoteView } from "@/lib/quote-types";

interface UseQuoteArgs {
  items: CartItem[];
  mode: "delivery" | "pickup";
  zoneSlug?: string;
  removeLines: (lineKeys: string[]) => void;
}

interface UseQuoteResult {
  quote: QuoteView | null;
  loading: boolean;
  /** Set when the server rejected lines and the cart dropped them. */
  droppedNotice: string | null;
  /** Unresolvable failure (network/500) — totals unavailable. */
  failed: boolean;
  /** Zone-level 422 reasons, for the checkout form. */
  zoneReasons: InvalidCartReason[];
}

interface AnsweredState {
  key: string | null;
  quote: QuoteView | null;
  failed: boolean;
  droppedNotice: string | null;
  zoneReasons: InvalidCartReason[];
}

export function useQuote({ items, mode, zoneSlug, removeLines }: UseQuoteArgs): UseQuoteResult {
  const requestKey = useMemo(
    () => JSON.stringify({ mode, zoneSlug: zoneSlug ?? null, items }),
    [mode, zoneSlug, items],
  );
  const [answered, setAnswered] = useState<AnsweredState>({
    key: null,
    quote: null,
    failed: false,
    droppedNotice: null,
    zoneReasons: [],
  });

  useEffect(() => {
    if (items.length === 0) return;
    const controller = new AbortController();

    fetch("/api/cart/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mode,
        ...(zoneSlug ? { zoneSlug } : {}),
        items: items.map(({ productId, variantId, quantity, toppingIds }) => ({
          productId,
          variantId,
          quantity,
          toppingIds,
        })),
      }),
    })
      .then(async (response) => {
        if (response.status === 422) {
          const body = (await response.json()) as { reasons?: InvalidCartReason[] };
          const reasons = body.reasons ?? [];
          const badIndexes = new Set(
            reasons
              .filter((reason) => LINE_REASON_CODES.has(reason.code) && reason.itemIndex !== undefined)
              .map((reason) => reason.itemIndex as number),
          );
          if (badIndexes.size > 0) {
            setAnswered((current) => ({
              ...current,
              droppedNotice: "Unele produse nu mai sunt disponibile și au fost scoase din coș.",
            }));
            // triggers a re-quote with the cleaned cart
            removeLines(items.filter((_, index) => badIndexes.has(index)).map(cartLineKey));
            return;
          }
          setAnswered({
            key: requestKey,
            quote: null,
            failed: false,
            droppedNotice: null,
            zoneReasons: reasons.filter((reason) => reason.code.startsWith("zone_")),
          });
          return;
        }

        if (!response.ok) throw new Error(`quote failed: ${response.status}`);
        const quote = (await response.json()) as QuoteView;
        setAnswered((current) => ({
          key: requestKey,
          quote,
          failed: false,
          droppedNotice: current.droppedNotice,
          zoneReasons: [],
        }));
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setAnswered({ key: requestKey, quote: null, failed: true, droppedNotice: null, zoneReasons: [] });
      });

    return () => controller.abort();
  }, [requestKey, items, mode, zoneSlug, removeLines]);

  if (items.length === 0) {
    return { quote: null, loading: false, droppedNotice: answered.droppedNotice, failed: false, zoneReasons: [] };
  }
  return {
    quote: answered.quote,
    loading: answered.key !== requestKey,
    droppedNotice: answered.droppedNotice,
    failed: answered.failed && answered.key === requestKey,
    zoneReasons: answered.zoneReasons,
  };
}
