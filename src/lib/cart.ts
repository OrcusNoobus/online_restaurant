/**
 * Client-held cart: types + pure helpers (002 03-research D1). The cart
 * stores ONLY ids and quantities — prices always come from the server quote.
 * localStorage plumbing lives in the CartProvider; this module stays pure.
 */

export interface CartItem {
  productId: number;
  variantId: number;
  quantity: number;
  toppingIds: number[];
}

/** Two lines merge iff product, variant AND topping selection are identical. */
export function cartLineKey(item: Pick<CartItem, "productId" | "variantId" | "toppingIds">): string {
  return `${item.productId}:${item.variantId}:${[...item.toppingIds].sort((a, b) => a - b).join(",")}`;
}

export function addItem(items: CartItem[], next: CartItem): CartItem[] {
  const key = cartLineKey(next);
  const existing = items.find((item) => cartLineKey(item) === key);
  if (!existing) return [...items, next];
  return items.map((item) =>
    cartLineKey(item) === key ? { ...item, quantity: Math.min(item.quantity + next.quantity, 99) } : item,
  );
}

export function setQuantity(items: CartItem[], key: string, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((item) => cartLineKey(item) !== key);
  return items.map((item) => (cartLineKey(item) === key ? { ...item, quantity: Math.min(quantity, 99) } : item));
}

export function itemCount(items: CartItem[]): number {
  return items.reduce((sum, { quantity }) => sum + quantity, 0);
}

/** Defensive parse of whatever was in localStorage — never trust old shapes. */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === "object" &&
        item !== null &&
        Number.isSafeInteger((item as CartItem).productId) &&
        Number.isSafeInteger((item as CartItem).variantId) &&
        Number.isSafeInteger((item as CartItem).quantity) &&
        (item as CartItem).quantity > 0 &&
        Array.isArray((item as CartItem).toppingIds) &&
        (item as CartItem).toppingIds.every((id) => Number.isSafeInteger(id)),
    );
  } catch {
    return [];
  }
}
