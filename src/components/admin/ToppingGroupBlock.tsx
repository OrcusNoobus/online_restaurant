"use client";

/**
 * One topping group in the catalog tree: toppings with availability toggles
 * (both roles) and per-size price cells (admin — upsert by sizeName, T08).
 */
import { useState } from "react";

import { formatBani } from "@/lib/money";

import { AvailabilityToggle } from "@/components/admin/AvailabilityToggle";
import type { PatchFn } from "@/components/admin/CatalogCategoryBlock";
import { PriceCell } from "@/components/admin/PriceCell";
import type { CatalogToppingGroup, StaffRole } from "@/components/admin/types";

interface ToppingGroupBlockProps {
  group: CatalogToppingGroup;
  role: StaffRole;
  onPatchTopping: PatchFn;
}

export function ToppingGroupBlock({ group, role, onPatchTopping }: Readonly<ToppingGroupBlockProps>) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<string | null>) {
    setBusyKey(key);
    setNotice(null);
    const error = await action();
    setBusyKey(null);
    if (error) setNotice(error);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-bold">{group.name}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {group.required ? "obligatoriu" : "opțional"} · {group.displayType === "radio" ? "o alegere" : "mai multe alegeri"}
        </p>
      </header>

      {notice && (
        <p className="mx-4 mt-3 rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {group.toppings.map((topping) => (
          <li key={topping.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span
                className={`text-sm font-medium ${topping.active ? "" : "text-zinc-400 line-through dark:text-zinc-500"}`}
              >
                {topping.name}
                {topping.sgrDepositBani > 0 && (
                  <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                    (SGR {formatBani(topping.sgrDepositBani)})
                  </span>
                )}
              </span>
              <AvailabilityToggle
                active={topping.active}
                busy={busyKey === `top-${topping.id}`}
                onToggle={() =>
                  void run(`top-${topping.id}`, () => onPatchTopping(topping.id, { active: !topping.active }))
                }
              />
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              {topping.prices.map((price) => (
                <li key={price.sizeName ?? "__default"} className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{price.sizeName ?? "standard"}:</span>
                  {role === "admin" ? (
                    <PriceCell
                      allowZero
                      priceBani={price.priceBani}
                      onSave={(priceBani) =>
                        onPatchTopping(topping.id, { prices: [{ sizeName: price.sizeName, priceBani }] })
                      }
                    />
                  ) : (
                    <span className="tabular-nums">{formatBani(price.priceBani)}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
