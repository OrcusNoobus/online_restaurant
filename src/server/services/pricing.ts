/**
 * Cart pricing — the single money engine for every channel (DECISIONS.md
 * 2026-07-04). Resolves every id against the database, enforces the option
 * rules, and computes subtotal / SGR / delivery fee / total in integer bani.
 * Contract: harness/specs/002-cos-comanda/06-contracts/api.md.
 */
import { assertBani } from "@/lib/money";
import type { QuoteRequest } from "@/lib/order-schemas";
import { type CouponRow, type CouponType, getCouponByCode } from "@/server/repositories/coupons";
import { type CatalogTopping, getCatalogForProducts } from "@/server/repositories/menu";
import { type DeliveryZoneRow, getZoneBySlug } from "@/server/repositories/zones";

export interface QuoteReason {
  code:
    | "empty_cart"
    | "product_not_found"
    | "product_inactive"
    | "variant_mismatch"
    | "topping_not_allowed"
    | "topping_inactive"
    | "topping_price_missing"
    | "missing_required_group"
    | "duplicate_topping"
    | "zone_required"
    | "zone_unknown"
    | "zone_inactive"
    | "coupon_unknown"
    | "coupon_inactive"
    | "coupon_not_started"
    | "coupon_expired";
  itemIndex?: number;
  groupName?: string;
  detail?: string;
}

export interface QuoteOption {
  toppingId: number;
  groupName: string;
  toppingName: string;
  priceBani: number;
  sgrDepositBani: number;
}

export interface QuoteItem {
  productId: number;
  variantId: number;
  quantity: number;
  productName: string;
  variantName: string | null;
  unitPriceBani: number;
  options: QuoteOption[];
  lineTotalBani: number;
}

export interface Quote {
  items: QuoteItem[];
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  freeDeliveryGapBani: number;
  /** Coupon reduction (006 D2) — 0 without a coupon; totalBani is already discounted. */
  discountBani: number;
  /** Applied coupon — id consumed by placeOrder, never serialized to the client. */
  coupon: { id: number; code: string; type: CouponType } | null;
  totalBani: number;
  /** Resolved zone (delivery only) — placeOrder stores the reference. */
  zone: DeliveryZoneRow | null;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reasons: QuoteReason[] };

function resolveToppingPrice(topping: CatalogTopping, variantName: string | null): number | null {
  const exact = topping.prices.find((price) => price.sizeName === variantName);
  if (exact) return exact.priceBani;
  // fall back to the size-agnostic row (sizeName null) when the variant is named
  const generic = topping.prices.find((price) => price.sizeName === null);
  return generic ? generic.priceBani : null;
}

/**
 * `now` drives the coupon validity window (006 D3) — placeOrder passes its
 * context clock so tests are deterministic end-to-end.
 */
export async function quoteCart(request: QuoteRequest, now: Date = new Date()): Promise<QuoteResult> {
  const reasons: QuoteReason[] = [];

  if (request.items.length === 0) reasons.push({ code: "empty_cart" });

  // Coupon resolution (006 D2/D3): exactly one refusal reason per invalid
  // code; a valid row is priced after the fee is known.
  let coupon: CouponRow | null = null;
  if (request.couponCode) {
    const found = await getCouponByCode(request.couponCode);
    if (!found) {
      reasons.push({ code: "coupon_unknown", detail: request.couponCode });
    } else if (!found.active) {
      reasons.push({ code: "coupon_inactive", detail: found.code });
    } else if (found.startsAt !== null && now.getTime() < found.startsAt.getTime()) {
      reasons.push({ code: "coupon_not_started", detail: found.code });
    } else if (found.endsAt !== null && now.getTime() > found.endsAt.getTime()) {
      reasons.push({ code: "coupon_expired", detail: found.code });
    } else {
      coupon = found;
    }
  }

  let zone: DeliveryZoneRow | null = null;
  if (request.mode === "delivery") {
    if (!request.zoneSlug) {
      reasons.push({ code: "zone_required" });
    } else {
      const found = await getZoneBySlug(request.zoneSlug);
      if (!found) {
        reasons.push({ code: "zone_unknown", detail: request.zoneSlug });
      } else if (!found.active) {
        reasons.push({ code: "zone_inactive", detail: found.name });
      } else {
        zone = {
          id: found.id,
          slug: found.slug,
          name: found.name,
          feeBani: found.feeBani,
          freeFromBani: found.freeFromBani,
        };
      }
    }
  }

  const catalog = await getCatalogForProducts([...new Set(request.items.map(({ productId }) => productId))]);

  const items: QuoteItem[] = [];
  let subtotalBani = 0;
  let sgrBani = 0;

  request.items.forEach((item, itemIndex) => {
    const product = catalog.get(item.productId);
    if (!product) {
      reasons.push({ code: "product_not_found", itemIndex });
      return;
    }
    if (!product.active) {
      reasons.push({ code: "product_inactive", itemIndex, detail: product.name });
      return;
    }

    const variant = product.variants.find(({ id }) => id === item.variantId);
    if (!variant) {
      reasons.push({ code: "variant_mismatch", itemIndex });
      return;
    }

    if (new Set(item.toppingIds).size !== item.toppingIds.length) {
      reasons.push({ code: "duplicate_topping", itemIndex });
      return;
    }

    const options: QuoteOption[] = [];
    let itemValid = true;
    const selectedGroupIds = new Set<number>();
    for (const toppingId of item.toppingIds) {
      const group = product.groups.find(({ toppings }) => toppings.some(({ id }) => id === toppingId));
      const topping = group?.toppings.find(({ id }) => id === toppingId);
      if (!group || !topping) {
        reasons.push({ code: "topping_not_allowed", itemIndex, detail: String(toppingId) });
        itemValid = false;
        continue;
      }
      if (!topping.active) {
        reasons.push({ code: "topping_inactive", itemIndex, detail: topping.name });
        itemValid = false;
        continue;
      }
      const priceBani = resolveToppingPrice(topping, variant.name);
      if (priceBani === null) {
        reasons.push({ code: "topping_price_missing", itemIndex, detail: topping.name });
        itemValid = false;
        continue;
      }
      selectedGroupIds.add(group.id);
      options.push({
        toppingId,
        groupName: group.name,
        toppingName: topping.name,
        priceBani,
        sgrDepositBani: topping.sgrDepositBani,
      });
    }

    // Required groups with >= 1 active topping must have a selection
    // (groups left empty by deactivation are skipped — same rule as the menu).
    for (const group of product.groups) {
      if (!group.required) continue;
      if (!group.toppings.some(({ active }) => active)) continue;
      if (!selectedGroupIds.has(group.id)) {
        reasons.push({ code: "missing_required_group", itemIndex, groupName: group.name });
        itemValid = false;
      }
    }

    if (!itemValid) return;

    const optionsPriceBani = options.reduce((sum, { priceBani }) => sum + priceBani, 0);
    const optionsSgrBani = options.reduce((sum, { sgrDepositBani }) => sum + sgrDepositBani, 0);
    const lineTotalBani = (variant.priceBani + optionsPriceBani + optionsSgrBani) * item.quantity;

    subtotalBani += (variant.priceBani + optionsPriceBani) * item.quantity;
    sgrBani += optionsSgrBani * item.quantity;
    items.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      productName: product.name,
      variantName: variant.name,
      unitPriceBani: variant.priceBani,
      options,
      lineTotalBani,
    });
  });

  if (reasons.length > 0) return { ok: false, reasons };

  let deliveryFeeBani = 0;
  let freeDeliveryGapBani = 0;
  if (request.mode === "delivery" && zone) {
    // Q8/Q9: the threshold compares against subtotal + SGR; below it the zone
    // fee applies (the order is never blocked), at/above it delivery is free.
    const towardThreshold = subtotalBani + sgrBani;
    if (towardThreshold < zone.freeFromBani) {
      deliveryFeeBani = zone.feeBani;
      freeDeliveryGapBani = zone.freeFromBani - towardThreshold;
    }
  }

  // Discount math (006 D2) — all three types manifest as discountBani; SGR
  // is never reduced (Q2), the threshold above stayed pre-discount (D-d).
  let discountBani = 0;
  if (coupon) {
    if (coupon.type === "percent") {
      // floor: deterministic, never exceeds the promised percentage (D-g)
      discountBani = Math.floor((subtotalBani * (coupon.value ?? 0)) / 100);
    } else if (coupon.type === "fixed") {
      // capped: the total never goes negative (spec FR2)
      discountBani = Math.min(coupon.value ?? 0, subtotalBani);
    } else {
      // free_delivery: equal to the fee — 0 at pickup / at-or-above the
      // threshold (accepted with zero effect, D-h)
      discountBani = deliveryFeeBani;
    }
  }

  const totalBani = subtotalBani + sgrBani + deliveryFeeBani - discountBani;
  for (const value of [subtotalBani, sgrBani, deliveryFeeBani, discountBani, totalBani]) assertBani(value);
  if (discountBani < 0 || totalBani < 0) {
    throw new RangeError(`discount out of range: discount=${discountBani} total=${totalBani}`);
  }

  return {
    ok: true,
    quote: {
      items,
      subtotalBani,
      sgrBani,
      deliveryFeeBani,
      freeDeliveryGapBani,
      discountBani,
      coupon: coupon ? { id: coupon.id, code: coupon.code, type: coupon.type } : null,
      totalBani,
      zone,
    },
  };
}
