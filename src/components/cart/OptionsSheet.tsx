"use client";

/**
 * Bottom sheet for configuring one product before adding it to the cart:
 * size, required groups (Ambalaj, Garanție SGR), optional extras, quantity.
 * Prices shown here are PREVIEW from the menu payload — the server quote is
 * authoritative (002 06-contracts). Structural props only (no @/server).
 */
import { useEffect, useMemo, useState } from "react";

import { formatBani } from "@/lib/money";

export interface SheetToppingPrice {
  sizeName: string | null;
  priceBani: number;
}

export interface SheetTopping {
  id: number;
  name: string;
  sgrDepositBani: number;
  prices: SheetToppingPrice[];
}

export interface SheetToppingGroup {
  id: number;
  name: string;
  required: boolean;
  displayType: string;
  toppings: SheetTopping[];
}

export interface SheetProduct {
  id: number;
  name: string;
  variants: { id: number; name: string | null; priceBani: number }[];
  toppingGroups: SheetToppingGroup[];
}

interface OptionsSheetProps {
  product: SheetProduct;
  onClose: () => void;
  onAdd: (selection: { variantId: number; quantity: number; toppingIds: number[] }) => void;
}

function toppingPriceFor(topping: SheetTopping, sizeName: string | null): number {
  const exact = topping.prices.find((price) => price.sizeName === sizeName);
  if (exact) return exact.priceBani;
  return topping.prices.find((price) => price.sizeName === null)?.priceBani ?? 0;
}

/** Single-option required groups (Ambalaj, SGR) start selected — same as the legacy shop. */
function defaultSelection(groups: SheetToppingGroup[]): Map<number, number[]> {
  const selection = new Map<number, number[]>();
  for (const group of groups) {
    selection.set(group.id, group.required && group.toppings.length === 1 ? [group.toppings[0].id] : []);
  }
  return selection;
}

export function OptionsSheet({ product, onClose, onAdd }: OptionsSheetProps) {
  const [variantId, setVariantId] = useState(
    product.variants.length === 1 ? product.variants[0].id : null,
  );
  const [quantity, setQuantityState] = useState(1);
  const [selected, setSelected] = useState(() => defaultSelection(product.toppingGroups));

  // lock body scroll while the sheet is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const variant = product.variants.find(({ id }) => id === variantId) ?? null;

  const missingGroups = product.toppingGroups.filter(
    (group) => group.required && (selected.get(group.id) ?? []).length === 0,
  );
  const canAdd = variant !== null && missingGroups.length === 0;

  const previewBani = useMemo(() => {
    if (!variant) return null;
    let perUnit = variant.priceBani;
    for (const group of product.toppingGroups) {
      for (const toppingId of selected.get(group.id) ?? []) {
        const topping = group.toppings.find(({ id }) => id === toppingId);
        if (topping) perUnit += toppingPriceFor(topping, variant.name) + topping.sgrDepositBani;
      }
    }
    return perUnit * quantity;
  }, [product, variant, selected, quantity]);

  function toggle(group: SheetToppingGroup, toppingId: number) {
    setSelected((current) => {
      const next = new Map(current);
      const chosen = next.get(group.id) ?? [];
      if (group.displayType === "radio") {
        next.set(group.id, chosen.includes(toppingId) && !group.required ? [] : [toppingId]);
      } else {
        next.set(
          group.id,
          chosen.includes(toppingId) ? chosen.filter((id) => id !== toppingId) : [...chosen, toppingId],
        );
      }
      return next;
    });
  }

  function submit() {
    if (!variant) return;
    onAdd({
      variantId: variant.id,
      quantity,
      toppingIds: [...selected.values()].flat(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label="Închide" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-xl dark:bg-zinc-900 sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{product.name}</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Închide
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {product.variants.length > 1 && (
            <fieldset>
              <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Mărime <span className="font-normal text-amber-600 dark:text-amber-400">obligatoriu</span>
              </legend>
              <div className="mt-2 space-y-2">
                {product.variants.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="variant"
                        checked={variantId === option.id}
                        onChange={() => setVariantId(option.id)}
                        className="accent-amber-600"
                      />
                      <span className="text-sm text-zinc-900 dark:text-zinc-50">{option.name ?? "Standard"}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatBani(option.priceBani)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {product.toppingGroups.map((group) => (
            <fieldset key={group.id}>
              <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {group.name}{" "}
                {group.required && <span className="font-normal text-amber-600 dark:text-amber-400">obligatoriu</span>}
              </legend>
              <div className="mt-2 space-y-2">
                {group.toppings.map((topping) => {
                  const chosen = (selected.get(group.id) ?? []).includes(topping.id);
                  const priceBani = variant ? toppingPriceFor(topping, variant.name) : null;
                  return (
                    <label
                      key={topping.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 has-checked:border-amber-500 has-checked:bg-amber-50 dark:border-zinc-700 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-950"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type={group.displayType === "radio" ? "radio" : "checkbox"}
                          name={`group-${group.id}`}
                          checked={chosen}
                          onChange={() => toggle(group, topping.id)}
                          className="accent-amber-600"
                        />
                        <span className="text-sm text-zinc-900 dark:text-zinc-50">{topping.name}</span>
                      </span>
                      <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                        {priceBani === null
                          ? "—"
                          : priceBani + topping.sgrDepositBani > 0
                            ? `+${formatBani(priceBani + topping.sgrDepositBani)}`
                            : "inclus"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cantitate</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantityState((q) => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-full border border-zinc-300 text-lg font-semibold dark:border-zinc-600"
                aria-label="Scade cantitatea"
              >
                −
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{quantity}</span>
              <button
                onClick={() => setQuantityState((q) => Math.min(99, q + 1))}
                className="h-9 w-9 rounded-full border border-zinc-300 text-lg font-semibold dark:border-zinc-600"
                aria-label="Crește cantitatea"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <footer className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          {!canAdd && (
            <p className="mb-2 text-center text-xs text-amber-600 dark:text-amber-400">
              {variant === null
                ? "Alege o mărime pentru a continua."
                : `Selectează: ${missingGroups.map(({ name }) => name).join(", ")}.`}
            </p>
          )}
          <button
            onClick={submit}
            disabled={!canAdd}
            className="w-full rounded-2xl bg-amber-600 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            Adaugă în coș{previewBani !== null ? ` · ${formatBani(previewBani)}` : ""}
          </button>
        </footer>
      </div>
    </div>
  );
}
