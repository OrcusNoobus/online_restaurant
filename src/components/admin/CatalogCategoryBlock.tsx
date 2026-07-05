"use client";

/**
 * One category card in the catalog tree (/admin/produse): products with
 * availability toggles (both roles), price cells + text editor (admin).
 * Presentational — every mutation goes through callbacks that resolve with
 * an error message (RO) or null; the page owns HTTP + refetch (Q14 matrix
 * is enforced server-side, the UI only hides what the role cannot do).
 */
import { useState } from "react";

import type { CatalogCategory, CatalogProduct, StaffRole } from "@/components/admin/types";
import { AvailabilityToggle } from "@/components/admin/AvailabilityToggle";
import { PriceCell } from "@/components/admin/PriceCell";

export type PatchFn = (id: number, patch: Record<string, unknown>) => Promise<string | null>;

interface CatalogCategoryBlockProps {
  category: CatalogCategory;
  role: StaffRole;
  groupNamesById: ReadonlyMap<number, string>;
  onPatchCategory: PatchFn;
  onPatchProduct: PatchFn;
  onPatchVariant: PatchFn;
}

export function CatalogCategoryBlock({
  category,
  role,
  groupNamesById,
  onPatchCategory,
  onPatchProduct,
  onPatchVariant,
}: Readonly<CatalogCategoryBlockProps>) {
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
      <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h2 className={`font-bold ${category.active ? "" : "text-zinc-400 line-through dark:text-zinc-500"}`}>
          {category.name}
        </h2>
        {role === "admin" && (
          <AvailabilityToggle
            active={category.active}
            busy={busyKey === `cat-${category.id}`}
            onToggle={() =>
              void run(`cat-${category.id}`, () => onPatchCategory(category.id, { active: !category.active }))
            }
          />
        )}
      </header>

      {notice && (
        <p className="mx-4 mt-3 rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {category.products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            role={role}
            groupNamesById={groupNamesById}
            busyKey={busyKey}
            run={run}
            onPatchProduct={onPatchProduct}
            onPatchVariant={onPatchVariant}
          />
        ))}
        {category.products.length === 0 && (
          <li className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Niciun produs în această categorie.</li>
        )}
      </ul>
    </section>
  );
}

interface ProductRowProps {
  product: CatalogProduct;
  role: StaffRole;
  groupNamesById: ReadonlyMap<number, string>;
  busyKey: string | null;
  run: (key: string, action: () => Promise<string | null>) => Promise<void>;
  onPatchProduct: PatchFn;
  onPatchVariant: PatchFn;
}

function ProductRow({ product, role, groupNamesById, busyKey, run, onPatchProduct, onPatchVariant }: ProductRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({
    name: product.name,
    description: product.description ?? "",
    ingredients: product.ingredients ?? "",
    allergens: product.allergens ?? "",
  });

  const textField =
    "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  function saveTexts() {
    const name = draft.name.trim();
    if (!name) return;
    void run(`prod-texts-${product.id}`, () =>
      onPatchProduct(product.id, {
        name,
        description: draft.description.trim() || null,
        ingredients: draft.ingredients.trim() || null,
        allergens: draft.allergens.trim() || null,
      }),
    );
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className={`min-w-0 flex-1 text-left font-medium ${
            product.active ? "" : "text-zinc-400 line-through dark:text-zinc-500"
          }`}
        >
          <span aria-hidden className="mr-1 inline-block w-3 text-zinc-400">
            {expanded ? "▾" : "▸"}
          </span>
          {product.name}
        </button>
        <AvailabilityToggle
          active={product.active}
          busy={busyKey === `prod-${product.id}`}
          onToggle={() => void run(`prod-${product.id}`, () => onPatchProduct(product.id, { active: !product.active }))}
        />
      </div>

      {expanded && (
        <div className="mt-2 space-y-3 pl-4">
          <ul className="space-y-1">
            {product.variants.map((variant) => (
              <li key={variant.id} className="flex items-center justify-between gap-3 text-sm">
                <span className={variant.active ? "" : "text-zinc-400 line-through dark:text-zinc-500"}>
                  {variant.name ?? "Standard"}
                </span>
                <span className="flex items-center gap-2">
                  {role === "admin" ? (
                    <PriceCell
                      priceBani={variant.priceBani}
                      onSave={(priceBani) => onPatchVariant(variant.id, { priceBani })}
                    />
                  ) : (
                    <span className="text-sm font-semibold tabular-nums">
                      {(variant.priceBani / 100).toFixed(2).replace(".", ",")} lei
                    </span>
                  )}
                  <AvailabilityToggle
                    active={variant.active}
                    busy={busyKey === `var-${variant.id}`}
                    onToggle={() =>
                      void run(`var-${variant.id}`, () => onPatchVariant(variant.id, { active: !variant.active }))
                    }
                  />
                </span>
              </li>
            ))}
          </ul>

          {product.toppingGroupIds.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Grupe de opțiuni:{" "}
              {product.toppingGroupIds.map((id) => groupNamesById.get(id) ?? `#${id}`).join(", ")}
            </p>
          )}

          {role === "admin" && (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Nume
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className={textField}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Descriere
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={2}
                  className={textField}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Ingrediente
                <textarea
                  value={draft.ingredients}
                  onChange={(event) => setDraft({ ...draft, ingredients: event.target.value })}
                  rows={2}
                  className={textField}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Alergeni
                <input
                  value={draft.allergens}
                  onChange={(event) => setDraft({ ...draft, allergens: event.target.value })}
                  className={textField}
                />
              </label>
              <button
                type="button"
                onClick={saveTexts}
                disabled={busyKey === `prod-texts-${product.id}` || draft.name.trim() === ""}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Salvează textele
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
