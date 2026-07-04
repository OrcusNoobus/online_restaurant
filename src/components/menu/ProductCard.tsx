import { formatBani } from "@/lib/money";

interface ProductCardProps {
  product: {
    name: string;
    description: string | null;
    variants: { id: number; name: string | null; priceBani: number }[];
  };
}

/**
 * One menu product with all its size variants. Product photos are a later
 * feature (02-clarify.md Q3) — until then every card gets the letter
 * placeholder, and imageUrl stays API-only.
 */
export function ProductCard({ product }: ProductCardProps) {
  const initial = product.name.trim().charAt(0).toUpperCase();
  const single = product.variants.length === 1 ? product.variants[0] : null;

  return (
    <article className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div
        aria-hidden
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-200 text-2xl font-semibold text-amber-700 dark:from-amber-950 dark:to-orange-900 dark:text-amber-300"
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{product.name}</h3>
        {product.description && (
          <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{product.description}</p>
        )}
        {single ? (
          <p className="mt-2 text-zinc-900 dark:text-zinc-50">
            {single.name && <span className="text-sm text-zinc-500 dark:text-zinc-400">{single.name} · </span>}
            <span className="font-semibold tabular-nums">{formatBani(single.priceBani)}</span>
          </p>
        ) : (
          <dl className="mt-2 space-y-1">
            {product.variants.map((variant) => (
              <div key={variant.id} className="flex items-baseline justify-between gap-4 text-sm">
                <dt className="text-zinc-500 dark:text-zinc-400">{variant.name ?? "Standard"}</dt>
                <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatBani(variant.priceBani)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
