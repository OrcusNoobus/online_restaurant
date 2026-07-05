"use client";

/**
 * Catalog admin (003 spec Q7/Q14, 06-contracts Catalog): the full tree from
 * GET /api/admin/catalog (inactive included — the public menu hides them).
 * Staff sees availability toggles on products/variants/toppings; admin also
 * edits prices and texts and creates categories/products. The Q14 matrix is
 * enforced server-side; here it only decides what to render.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { CatalogCategoryBlock } from "@/components/admin/CatalogCategoryBlock";
import { NewCategoryForm, NewProductForm, type NewProductInputUi } from "@/components/admin/NewEntityForms";
import { ToppingGroupBlock } from "@/components/admin/ToppingGroupBlock";
import type { CatalogData, StaffRole } from "@/components/admin/types";

const ERROR_MESSAGES_RO: Record<string, string> = {
  name_taken: "Există deja o intrare cu acest nume.",
  category_not_found: "Categoria aleasă nu mai există.",
  topping_group_not_found: "Una dintre grupele de opțiuni nu mai există.",
  forbidden_role: "Doar administratorul poate face această modificare.",
  not_found: "Intrarea nu a fost găsită — reîncarcă pagina.",
  validation: "Date invalide — verifică valorile introduse.",
};

function failureMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES_RO[code]) ?? "Modificarea nu a reușit. Reîncearcă.";
}

export default function AdminCatalogPage() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState<"category" | "product" | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (!response.ok) {
      setLoadFailed(true);
      return;
    }
    setCatalog((await response.json()) as CatalogData);
    setLoadFailed(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/admin/auth/me", { cache: "no-store" });
      if (me.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (me.ok) {
        const payload = (await me.json()) as { user: { role: StaffRole } };
        setRole(payload.user.role);
      }
      await refresh();
    })().catch(() => setLoadFailed(true));
  }, [refresh]);

  /** Shared shape for every mutation: hit the API, refetch on success, map errors to RO. */
  const mutate = useCallback(
    async (path: string, method: "PATCH" | "POST", body: Record<string, unknown>): Promise<string | null> => {
      try {
        const response = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.status === 401) {
          window.location.assign("/admin/login");
          return "Sesiune expirată.";
        }
        if (response.ok) {
          await refresh();
          return null;
        }
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        return failureMessage(payload?.error);
      } catch {
        return "Eroare de rețea. Verifică conexiunea și reîncearcă.";
      }
    },
    [refresh],
  );

  const patchCategory = useCallback(
    (id: number, patch: Record<string, unknown>) => mutate(`/api/admin/categories/${id}`, "PATCH", patch),
    [mutate],
  );
  const patchProduct = useCallback(
    (id: number, patch: Record<string, unknown>) => mutate(`/api/admin/products/${id}`, "PATCH", patch),
    [mutate],
  );
  const patchVariant = useCallback(
    (id: number, patch: Record<string, unknown>) => mutate(`/api/admin/variants/${id}`, "PATCH", patch),
    [mutate],
  );
  const patchTopping = useCallback(
    (id: number, patch: Record<string, unknown>) => mutate(`/api/admin/toppings/${id}`, "PATCH", patch),
    [mutate],
  );
  const createCategory = useCallback(
    (input: { name: string }) => mutate("/api/admin/categories", "POST", input),
    [mutate],
  );
  const createProduct = useCallback(
    (input: NewProductInputUi) => mutate("/api/admin/products", "POST", { ...input }),
    [mutate],
  );

  const groupNamesById = useMemo(
    () => new Map((catalog?.toppingGroups ?? []).map((group) => [group.id, group.name])),
    [catalog],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Produse</h1>
        {role === "admin" && catalog && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(creating === "category" ? null : "category")}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
            >
              + Categorie
            </button>
            <button
              type="button"
              onClick={() => setCreating(creating === "product" ? null : "product")}
              className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              + Produs
            </button>
          </div>
        )}
      </div>

      {loadFailed && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          Nu am putut încărca catalogul. Reîncarcă pagina.
        </p>
      )}
      {!catalog && !loadFailed && <p className="text-sm text-zinc-500 dark:text-zinc-400">Se încarcă…</p>}

      {creating === "category" && catalog && (
        <NewCategoryForm onCreate={createCategory} onDone={() => setCreating(null)} />
      )}
      {creating === "product" && catalog && (
        <NewProductForm
          categories={catalog.categories}
          toppingGroups={catalog.toppingGroups}
          onCreate={createProduct}
          onDone={() => setCreating(null)}
        />
      )}

      {catalog && role && (
        <>
          {catalog.categories.map((category) => (
            <CatalogCategoryBlock
              key={category.id}
              category={category}
              role={role}
              groupNamesById={groupNamesById}
              onPatchCategory={patchCategory}
              onPatchProduct={patchProduct}
              onPatchVariant={patchVariant}
            />
          ))}

          <h2 className="mt-2 text-lg font-bold tracking-tight">Grupe de opțiuni</h2>
          {catalog.toppingGroups.map((group) => (
            <ToppingGroupBlock key={group.id} group={group} role={role} onPatchTopping={patchTopping} />
          ))}
        </>
      )}
    </div>
  );
}
