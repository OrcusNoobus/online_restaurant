"use client";

/**
 * Re-quotes the cart on every change: the server is the only price engine.
 * Stale lines (deactivated products/toppings, changed menu) are removed from
 * the client cart and reported so the customer sees WHY something vanished.
 * `loading` is derived (requestKey vs answered key) — no sync setState in effects.
 */
import { useEffect, useMemo, useState } from "react";

import { type CartItem, cartLineKey } from "@/lib/cart";
import {
  COUPON_REASON_CODES,
  COUPON_REASON_MESSAGES_RO,
  type InvalidCartReason,
  LINE_REASON_CODES,
  type QuoteView,
} from "@/lib/quote-types";

interface UseQuoteArgs {
  items: CartItem[];
  mode: "delivery" | "pickup";
  zoneSlug?: string;
  couponCode?: string | null;
  removeLines: (lineKeys: string[]) => void;
  /** Called when the server refuses the stored coupon (006 D3) — triggers a clean re-quote. */
  clearCoupon?: () => void;
}

interface UseQuoteResult {
  quote: QuoteView | null;
  loading: boolean;
  /** Set when the server rejected lines and the cart dropped them. */
  droppedNotice: string | null;
  /** Set when the server refused the coupon and the cart dropped IT (never the lines). */
  couponNotice: string | null;
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
  couponNotice: string | null;
  zoneReasons: InvalidCartReason[];
}

export function useQuote({ items, mode, zoneSlug, couponCode, removeLines, clearCoupon }: UseQuoteArgs): UseQuoteResult {
  const requestKey = useMemo(
    () => JSON.stringify({ mode, zoneSlug: zoneSlug ?? null, couponCode: couponCode ?? null, items }),
    [mode, zoneSlug, couponCode, items],
  );
  const [answered, setAnswered] = useState<AnsweredState>({
    key: null,
    quote: null,
    failed: false,
    droppedNotice: null,
    couponNotice: null,
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
        ...(couponCode ? { couponCode } : {}),
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
          // an invalid coupon drops the COUPON, never the cart (006 D3)
          const couponReason = reasons.find((reason) => COUPON_REASON_CODES.has(reason.code));
          if (badIndexes.size > 0 || couponReason) {
            setAnswered((current) => ({
              ...current,
              ...(badIndexes.size > 0
                ? { droppedNotice: "Unele produse nu mai sunt disponibile și au fost scoase din coș." }
                : {}),
              ...(couponReason
                ? { couponNotice: COUPON_REASON_MESSAGES_RO[couponReason.code] ?? "Cuponul nu a putut fi aplicat." }
                : {}),
            }));
            // either change triggers a re-quote with the cleaned state
            if (couponReason) clearCoupon?.();
            if (badIndexes.size > 0) {
              removeLines(items.filter((_, index) => badIndexes.has(index)).map(cartLineKey));
            }
            return;
          }
          setAnswered((current) => ({
            key: requestKey,
            quote: null,
            failed: false,
            droppedNotice: null,
            couponNotice: current.couponNotice,
            zoneReasons: reasons.filter((reason) => reason.code.startsWith("zone_")),
          }));
          return;
        }

        if (!response.ok) throw new Error(`quote failed: ${response.status}`);
        const quote = (await response.json()) as QuoteView;
        setAnswered((current) => ({
          key: requestKey,
          quote,
          failed: false,
          droppedNotice: current.droppedNotice,
          couponNotice: current.couponNotice,
          zoneReasons: [],
        }));
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setAnswered({
          key: requestKey,
          quote: null,
          failed: true,
          droppedNotice: null,
          couponNotice: null,
          zoneReasons: [],
        });
      });

    return () => controller.abort();
  }, [requestKey, items, mode, zoneSlug, couponCode, removeLines, clearCoupon]);

  if (items.length === 0) {
    return {
      quote: null,
      loading: false,
      droppedNotice: answered.droppedNotice,
      couponNotice: answered.couponNotice,
      failed: false,
      zoneReasons: [],
    };
  }
  return {
    quote: answered.quote,
    loading: answered.key !== requestKey,
    droppedNotice: answered.droppedNotice,
    couponNotice: answered.couponNotice,
    failed: answered.failed && answered.key === requestKey,
    zoneReasons: answered.zoneReasons,
  };
}
