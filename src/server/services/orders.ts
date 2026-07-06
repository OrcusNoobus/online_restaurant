/**
 * Order placement — re-prices through the same engine as the quote, applies
 * the schedule/payment rules, and persists atomically with snapshots.
 * Contract: harness/specs/002-cos-comanda/06-contracts/api.md.
 * The clock is injected so tests are deterministic; production passes nothing.
 */
import type { OrderRequest } from "@/lib/order-schemas";
import { estimateMinutesFor, isOpenAt, isValidScheduledFor } from "@/lib/schedule";
import { insertOrder, type NewOrder } from "@/server/repositories/orders";
import { type QuoteReason, quoteCart } from "@/server/services/pricing";
import { getScheduleConfig } from "@/server/services/settings";

export interface OrderReason {
  code: "shop_closed" | "schedule_out_of_hours" | "payment_not_allowed_for_mode" | "invalid_pickup_estimate";
  detail?: string;
}

export interface PlacedOrder {
  orderId: number;
  orderNumber: string;
  status: "new";
  mode: "delivery" | "pickup";
  scheduledFor: string | null;
  estimateMinutes: number | null;
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  totalBani: number;
}

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | { ok: false; error: "invalid_cart"; reasons: QuoteReason[] }
  | { ok: false; error: "invalid_order"; reasons: OrderReason[] };

const ALLOWED_PAYMENT: Record<OrderRequest["mode"], OrderRequest["paymentMethod"][]> = {
  delivery: ["cash", "card_delivery"],
  pickup: ["cash", "card_restaurant"],
};

export interface PlaceOrderContext {
  clientIp: string | null;
  now?: Date;
  /** Session-derived by the route (never client input); absent/null = guest (010, FR3). */
  customerId?: number | null;
}

export async function placeOrder(request: OrderRequest, context: PlaceOrderContext): Promise<PlaceOrderResult> {
  const now = context.now ?? new Date();

  const quoted = await quoteCart(request);
  if (!quoted.ok) return { ok: false, error: "invalid_cart", reasons: quoted.reasons };
  const { quote } = quoted;

  const reasons: OrderReason[] = [];

  if (!ALLOWED_PAYMENT[request.mode].includes(request.paymentMethod)) {
    reasons.push({ code: "payment_not_allowed_for_mode", detail: request.paymentMethod });
  }

  // live values from restaurant_settings — an admin edit applies to the very
  // next order, no cache (003 research D6, spec FR9)
  const schedule = await getScheduleConfig();

  if (!isOpenAt(schedule, now)) reasons.push({ code: "shop_closed" });

  // zod checked only the shape; membership in the CURRENT option set is
  // semantic and lives here (003 06-contracts — invalid_pickup_estimate)
  if (
    request.pickupEstimateMinutes != null &&
    !schedule.pickupEstimateOptionsMinutes.includes(request.pickupEstimateMinutes)
  ) {
    reasons.push({ code: "invalid_pickup_estimate", detail: String(request.pickupEstimateMinutes) });
  }

  const scheduledFor = request.scheduledFor ? new Date(request.scheduledFor) : null;
  let estimateMinutes: number | null = null;
  if (scheduledFor) {
    const leadMinutes = estimateMinutesFor(schedule, request.mode, request.pickupEstimateMinutes ?? undefined);
    if (!isValidScheduledFor(schedule, scheduledFor, now, leadMinutes)) {
      reasons.push({ code: "schedule_out_of_hours" });
    }
  } else {
    // ASAP: the quoted estimate is part of the order record (02-clarify Q10)
    estimateMinutes = estimateMinutesFor(schedule, request.mode, request.pickupEstimateMinutes ?? undefined);
  }

  if (reasons.length > 0) return { ok: false, error: "invalid_order", reasons };

  const order: NewOrder = {
    mode: request.mode,
    customerFirstName: request.customer.firstName,
    customerLastName: request.customer.lastName,
    phone: request.customer.phone,
    email: request.customer.email ?? null,
    zoneId: quote.zone?.id ?? null,
    addressStreet: request.addressStreet ?? null,
    notes: request.notes ?? null,
    scheduledFor,
    estimateMinutes,
    paymentMethod: request.paymentMethod,
    subtotalBani: quote.subtotalBani,
    sgrBani: quote.sgrBani,
    deliveryFeeBani: quote.deliveryFeeBani,
    totalBani: quote.totalBani,
    termsAcceptedAt: now,
    clientIp: context.clientIp,
    customerId: context.customerId ?? null,
    items: quote.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      unitPriceBani: item.unitPriceBani,
      quantity: item.quantity,
      lineTotalBani: item.lineTotalBani,
      options: item.options.map((option) => ({
        toppingId: option.toppingId,
        groupName: option.groupName,
        toppingName: option.toppingName,
        priceBani: option.priceBani,
        sgrDepositBani: option.sgrDepositBani,
      })),
    })),
  };

  const orderId = await insertOrder(order);

  return {
    ok: true,
    order: {
      orderId,
      orderNumber: `#${orderId}`,
      status: "new",
      mode: request.mode,
      scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
      estimateMinutes,
      subtotalBani: quote.subtotalBani,
      sgrBani: quote.sgrBani,
      deliveryFeeBani: quote.deliveryFeeBani,
      totalBani: quote.totalBani,
    },
  };
}
