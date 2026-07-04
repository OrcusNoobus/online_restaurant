"use client";

/**
 * Cart page: server-quoted lines with editable quantities. The delivery fee
 * depends on the locality, so it is computed at checkout — this page shows
 * subtotal + SGR and a clear note about the fee.
 */
import Link from "next/link";

import { useCart } from "@/components/cart/cart-store";
import { useQuote } from "@/components/cart/useQuote";
import { cartLineKey } from "@/lib/cart";
import { formatBani } from "@/lib/money";

export default function CartPage() {
  const { items, changeQuantity, removeLines } = useCart();
  const { quote, loading, droppedNotice, failed } = useQuote({ items, mode: "pickup", removeLines });

  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Coșul tău</h1>
          <Link href="/" className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ← Înapoi la meniu
          </Link>
        </header>

        {droppedNotice && (
          <p className="mt-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {droppedNotice}
          </p>
        )}

        {items.length === 0 && (
          <div className="pt-12 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">Coșul este gol.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full bg-amber-600 px-6 py-2.5 font-semibold text-white"
            >
              Vezi meniul
            </Link>
          </div>
        )}

        {failed && items.length > 0 && (
          <p className="mt-6 rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
            Nu am putut calcula totalul. Verifică conexiunea și reîncearcă.
          </p>
        )}

        {quote && items.length > 0 && (
          <>
            <ul className="mt-6 space-y-3">
              {quote.items.map((line, index) => {
                const cartItem = items[index];
                if (!cartItem) return null;
                const key = cartLineKey(cartItem);
                return (
                  <li
                    key={key}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {line.productName}
                          {line.variantName && (
                            <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {line.variantName}</span>
                          )}
                        </h3>
                        {line.options.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                            {line.options.map((option) => (
                              <li key={option.toppingId}>
                                {option.toppingName}
                                {option.priceBani + option.sgrDepositBani > 0 &&
                                  ` (+${formatBani(option.priceBani + option.sgrDepositBani)})`}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">{formatBani(line.lineTotalBani)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => changeQuantity(key, cartItem.quantity - 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 font-semibold dark:border-zinc-600"
                          aria-label="Scade cantitatea"
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-semibold tabular-nums">{line.quantity}</span>
                        <button
                          onClick={() => changeQuantity(key, cartItem.quantity + 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 font-semibold dark:border-zinc-600"
                          aria-label="Crește cantitatea"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeLines([key])}
                        className="text-sm text-zinc-500 underline dark:text-zinc-400"
                      >
                        Șterge
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-6 space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatBani(quote.subtotalBani)}</dd>
              </div>
              {quote.sgrBani > 0 && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Garanție SGR</dt>
                  <dd className="font-semibold tabular-nums">{formatBani(quote.sgrBani)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-200 pt-2 text-base dark:border-zinc-700">
                <dt className="font-semibold">Total produse</dt>
                <dd className="font-bold tabular-nums">{formatBani(quote.subtotalBani + quote.sgrBani)}</dd>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Taxa de livrare (dacă e cazul) se calculează la finalizare, în funcție de localitate.
              </p>
            </dl>

            <Link
              href="/comanda"
              className="mt-6 block w-full rounded-2xl bg-amber-600 py-3 text-center font-semibold text-white active:bg-amber-700"
            >
              Finalizează comanda
            </Link>
          </>
        )}

        {loading && items.length > 0 && !quote && (
          <p className="pt-12 text-center text-zinc-500 dark:text-zinc-400">Se calculează…</p>
        )}
      </div>
    </div>
  );
}
