import { CategoryNav } from "@/components/menu/CategoryNav";
import { ProductCard } from "@/components/menu/ProductCard";
import { getMenu } from "@/server/repositories/menu";

// The menu must reflect the database on every request, not get frozen into
// static HTML at build time (products change from the admin later).
export const dynamic = "force-dynamic";

export default async function MenuPage() {
  // The contract returns empty active categories; the page hides them.
  const menu = (await getMenu()).filter((category) => category.products.length > 0);

  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="mx-auto w-full max-w-2xl px-4 pb-4 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Royal Food Delivery</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Livrare la domiciliu în Sântana de Mureș
        </p>
      </header>
      <CategoryNav categories={menu.map(({ slug, name }) => ({ slug, name }))} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16">
        {menu.length === 0 && (
          <p className="pt-12 text-center text-zinc-500 dark:text-zinc-400">
            Meniul nu este disponibil momentan. Reveniți în curând!
          </p>
        )}
        {menu.map((category) => (
          <section key={category.id} id={category.slug} className="scroll-mt-16 pt-8">
            <h2 className="text-xl font-bold tracking-tight">{category.name}</h2>
            <div className="mt-4 space-y-3">
              {category.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
