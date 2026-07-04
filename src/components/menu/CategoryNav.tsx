interface CategoryNavProps {
  categories: { slug: string; name: string }[];
}

/** Sticky, horizontally scrollable category chips linking to page anchors. */
export function CategoryNav({ categories }: CategoryNavProps) {
  return (
    <nav
      aria-label="Categorii"
      className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90"
    >
      <ul className="mx-auto flex w-full max-w-2xl gap-2 overflow-x-auto px-4 py-3">
        {categories.map((category) => (
          <li key={category.slug}>
            <a
              href={`#${category.slug}`}
              className="block whitespace-nowrap rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-amber-500 dark:hover:text-amber-400"
            >
              {category.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
