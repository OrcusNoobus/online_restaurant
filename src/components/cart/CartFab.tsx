"use client";

/**
 * Floating cart button — visible on the menu, hidden on cart/checkout pages
 * where the cart is already on screen.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCart } from "@/components/cart/cart-store";

export function CartFab() {
  const { count } = useCart();
  const pathname = usePathname();

  if (count === 0) return null;
  if (pathname.startsWith("/cos") || pathname.startsWith("/comanda")) return null;

  return (
    <Link
      href="/cos"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-amber-600 px-5 py-3 font-semibold text-white shadow-lg active:bg-amber-700"
    >
      <span aria-hidden>🛒</span>
      Coș
      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-sm font-bold tabular-nums text-amber-700">
        {count}
      </span>
    </Link>
  );
}
