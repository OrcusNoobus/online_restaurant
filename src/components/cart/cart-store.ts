"use client";

/**
 * Client cart state over localStorage via useSyncExternalStore — the cart
 * survives refresh (002 01-spec.md NFR) and hydration stays consistent:
 * the server snapshot is empty, the client re-renders with the stored cart.
 */
import { useSyncExternalStore } from "react";

import { addItem, type CartItem, cartLineKey, itemCount, parseStoredCart, setQuantity } from "@/lib/cart";

const STORAGE_KEY = "rfd-cart-v1";
// The coupon lives under its OWN key (006 D5): the rfd-cart-v1 array format
// stays untouched, so carts stored before feat-011 keep parsing.
const COUPON_KEY = "rfd-coupon-v1";
const EMPTY: CartItem[] = [];

let items: CartItem[] | null = null;
/** undefined = not read from storage yet; null = no coupon. */
let couponCode: string | null | undefined;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (items === null) {
    items = typeof window === "undefined" ? EMPTY : parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
  }
  return items;
}

function readCoupon(): string | null {
  if (couponCode === undefined) {
    couponCode = typeof window === "undefined" ? null : window.localStorage.getItem(COUPON_KEY);
  }
  return couponCode;
}

function write(next: CartItem[]): void {
  items = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

function writeCoupon(next: string | null): void {
  couponCode = next;
  if (next === null) window.localStorage.removeItem(COUPON_KEY);
  else window.localStorage.setItem(COUPON_KEY, next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface CartApi {
  items: CartItem[];
  count: number;
  /** Applied coupon code (006 D-a: at most one) — survives navigation and reload. */
  couponCode: string | null;
  add: (item: CartItem) => void;
  changeQuantity: (lineKey: string, quantity: number) => void;
  removeLines: (lineKeys: string[]) => void;
  /** Overwrite the whole cart — the assistant writes the server-returned cart back verbatim (008 Q11). */
  replace: (items: CartItem[]) => void;
  /** Replaces any previous code (D-a); the server decides validity. */
  setCoupon: (code: string) => void;
  clearCoupon: () => void;
  clear: () => void;
}

const actions = {
  add: (item: CartItem) => write(addItem(read(), item)),
  changeQuantity: (lineKey: string, quantity: number) => write(setQuantity(read(), lineKey, quantity)),
  removeLines: (lineKeys: string[]) => write(read().filter((item) => !lineKeys.includes(cartLineKey(item)))),
  replace: (next: CartItem[]) => write(next),
  setCoupon: (code: string) => writeCoupon(code),
  clearCoupon: () => writeCoupon(null),
  // an emptied/placed cart takes its coupon with it
  clear: () => {
    writeCoupon(null);
    write([]);
  },
};

export function useCart(): CartApi {
  const current = useSyncExternalStore(subscribe, read, () => EMPTY);
  const coupon = useSyncExternalStore(subscribe, readCoupon, () => null);
  return { items: current, count: itemCount(current), couponCode: coupon, ...actions };
}
