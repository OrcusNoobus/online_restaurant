"use client";

/**
 * Admin-only creation forms (003 06-contracts Catalog): new category and new
 * product (≥ 1 variant, single-size → name null, server-side slugs). The page
 * owns the POSTs; callbacks resolve with an error message (RO) or null.
 */
import { useState } from "react";

import { parseLeiToBani } from "@/components/admin/format";
import type { CatalogCategory, CatalogToppingGroup } from "@/components/admin/types";

const FIELD =
  "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const LABEL = "block text-xs font-medium text-zinc-600 dark:text-zinc-300";

export function NewCategoryForm({
  onCreate,
  onDone,
}: Readonly<{ onCreate: (input: { name: string }) => Promise<string | null>; onDone: () => void }>) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const failure = await onCreate({ name: name.trim() });
    setBusy(false);
    if (failure) setError(failure);
    else onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-white p-4 dark:border-amber-700 dark:bg-zinc-900">
      <h2 className="font-bold">Categorie nouă</h2>
      {error && <p className="rounded-xl bg-red-100 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <label className={LABEL}>
        Nume
        <input value={name} onChange={(event) => setName(event.target.value)} className={FIELD} autoFocus />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || name.trim() === ""}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Creează categoria
        </button>
        <button type="button" onClick={onDone} className="rounded-xl px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">
          Renunță
        </button>
      </div>
    </div>
  );
}

export interface NewProductInputUi {
  categoryId: number;
  name: string;
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  variants: { name: string | null; priceBani: number }[];
  toppingGroupIds: number[];
}

interface NewProductFormProps {
  categories: CatalogCategory[];
  toppingGroups: CatalogToppingGroup[];
  onCreate: (input: NewProductInputUi) => Promise<string | null>;
  onDone: () => void;
}

interface VariantDraft {
  name: string;
  priceText: string;
}

export function NewProductForm({ categories, toppingGroups, onCreate, onDone }: Readonly<NewProductFormProps>) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [allergens, setAllergens] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([{ name: "", priceText: "" }]);
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateVariant(index: number, patch: Partial<VariantDraft>) {
    setVariants((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function parsedVariants(): { name: string | null; priceBani: number }[] | null {
    const rows: { name: string | null; priceBani: number }[] = [];
    for (const draft of variants) {
      const priceBani = parseLeiToBani(draft.priceText);
      if (priceBani === null || priceBani <= 0) return null;
      // one nameless row = single-size product; multiple rows need names
      rows.push({ name: draft.name.trim() || null, priceBani });
    }
    if (rows.length > 1 && rows.some((row) => row.name === null)) return null;
    return rows;
  }

  const variantsValid = parsedVariants() !== null;
  const canSubmit = !busy && name.trim() !== "" && categoryId > 0 && variantsValid;

  async function submit() {
    const parsed = parsedVariants();
    if (!parsed) return;
    setBusy(true);
    setError(null);
    const failure = await onCreate({
      categoryId,
      name: name.trim(),
      description: description.trim() || null,
      ingredients: ingredients.trim() || null,
      allergens: allergens.trim() || null,
      variants: parsed,
      toppingGroupIds: groupIds,
    });
    setBusy(false);
    if (failure) setError(failure);
    else onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-white p-4 dark:border-amber-700 dark:bg-zinc-900">
      <h2 className="font-bold">Produs nou</h2>
      {error && <p className="rounded-xl bg-red-100 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Categorie
          <select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))} className={FIELD}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Nume
          <input value={name} onChange={(event) => setName(event.target.value)} className={FIELD} />
        </label>
      </div>

      <label className={LABEL}>
        Descriere
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className={FIELD} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Ingrediente
          <textarea value={ingredients} onChange={(event) => setIngredients(event.target.value)} rows={2} className={FIELD} />
        </label>
        <label className={LABEL}>
          Alergeni
          <textarea value={allergens} onChange={(event) => setAllergens(event.target.value)} rows={2} className={FIELD} />
        </label>
      </div>

      <fieldset>
        <legend className={LABEL}>Mărimi și prețuri (o singură mărime → lasă numele gol)</legend>
        <div className="mt-1 space-y-2">
          {variants.map((draft, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={draft.name}
                onChange={(event) => updateVariant(index, { name: event.target.value })}
                placeholder={variants.length === 1 ? "(mărime unică)" : "ex.: 30 cm"}
                className="w-40 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                value={draft.priceText}
                onChange={(event) => updateVariant(index, { priceText: event.target.value })}
                placeholder="preț (lei)"
                inputMode="decimal"
                className="w-28 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              />
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}
                  aria-label="Șterge mărimea"
                  className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setVariants((current) => [...current, { name: "", priceText: "" }])}
            className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            + Adaugă mărime
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className={LABEL}>Grupe de opțiuni</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {toppingGroups.map((group) => (
            <label key={group.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={groupIds.includes(group.id)}
                onChange={(event) =>
                  setGroupIds((current) =>
                    event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id),
                  )
                }
                className="accent-amber-600"
              />
              {group.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Creează produsul
        </button>
        <button type="button" onClick={onDone} className="rounded-xl px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">
          Renunță
        </button>
      </div>
    </div>
  );
}
