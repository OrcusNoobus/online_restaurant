"use client";

/**
 * Client cart state over localStorage via useSyncExternalStore — the cart
 * survives refresh (002 01-spec.md NFR) and hydration stays consistent:
 * the server snapshot is empty, the client re-renders with the stored cart.
 */
import { useSyncExternalStore } from "react";

import { addItem, type CartItem, cartLineKey, itemCount, parseStoredCart, setQuantity } from "@/lib/cart";

const STORAGE_KEY = "rfd-cart-v1";
const EMPTY: CartItem[] = [];

let items: CartItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (items === null) {
    items = typeof window === "undefined" ? EMPTY : parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
  }
  return items;
}

function write(next: CartItem[]): void {
  items = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface CartApi {
  items: CartItem[];
  count: number;
  add: (item: CartItem) => void;
  changeQuantity: (lineKey: string, quantity: number) => void;
  removeLines: (lineKeys: string[]) => void;
  clear: () => void;
}

const actions = {
  add: (item: CartItem) => write(addItem(read(), item)),
  changeQuantity: (lineKey: string, quantity: number) => write(setQuantity(read(), lineKey, quantity)),
  removeLines: (lineKeys: string[]) => write(read().filter((item) => !lineKeys.includes(cartLineKey(item)))),
  clear: () => write([]),
};

export function useCart(): CartApi {
  const current = useSyncExternalStore(subscribe, read, () => EMPTY);
  return { items: current, count: itemCount(current), ...actions };
}
