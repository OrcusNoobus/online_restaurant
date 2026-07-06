/**
 * Client-side mirror of the /api/cart/quote and /api/orders response shapes
 * (002 06-contracts/api.md). Types only — the server remains authoritative.
 */

export interface QuoteOptionView {
  toppingId: number;
  groupName: string;
  toppingName: string;
  priceBani: number;
  sgrDepositBani: number;
}

export interface QuoteItemView {
  productId: number;
  variantId: number;
  quantity: number;
  productName: string;
  variantName: string | null;
  unitPriceBani: number;
  options: QuoteOptionView[];
  lineTotalBani: number;
}

export interface QuoteCouponView {
  code: string;
  type: "percent" | "fixed" | "free_delivery";
}

export interface QuoteView {
  items: QuoteItemView[];
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  freeDeliveryGapBani: number;
  /** 0 without a coupon; totalBani is already discounted (006). */
  discountBani: number;
  coupon: QuoteCouponView | null;
  totalBani: number;
}

export interface InvalidCartReason {
  code: string;
  itemIndex?: number;
  groupName?: string;
  detail?: string;
}

export interface PlacedOrderView {
  orderId: number;
  orderNumber: string;
  status: string;
  mode: "delivery" | "pickup";
  scheduledFor: string | null;
  estimateMinutes: number | null;
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  totalBani: number;
}

export interface ZoneView {
  id: number;
  slug: string;
  name: string;
  feeBani: number;
  freeFromBani: number;
}

/** Reason codes that identify a broken cart LINE (drop it client-side). */
export const LINE_REASON_CODES = new Set([
  "product_not_found",
  "product_inactive",
  "variant_mismatch",
  "topping_not_allowed",
  "topping_inactive",
  "topping_price_missing",
  "missing_required_group",
  "duplicate_topping",
]);

/**
 * Reason codes that identify an invalid COUPON (006 D3) — the client drops
 * the stored coupon, shows the per-code message, and re-quotes; the cart
 * itself is never touched.
 */
export const COUPON_REASON_CODES = new Set([
  "coupon_unknown",
  "coupon_inactive",
  "coupon_not_started",
  "coupon_expired",
]);
