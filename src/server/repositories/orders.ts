/**
 * Order writes. One transaction per placed order: the order row, its lines
 * and their options land together or not at all (002 01-spec.md FR6).
 * All values arrive pre-validated and pre-priced from the orders service.
 */
import { db } from "../db/client";
import { orderItemOptions, orderItems, orders } from "../db/schema";

export interface NewOrderOption {
  toppingId: number;
  groupName: string;
  toppingName: string;
  priceBani: number;
  sgrDepositBani: number;
}

export interface NewOrderItem {
  productId: number;
  variantId: number;
  productName: string;
  variantName: string | null;
  unitPriceBani: number;
  quantity: number;
  lineTotalBani: number;
  options: NewOrderOption[];
}

export interface NewOrder {
  mode: "delivery" | "pickup";
  customerFirstName: string;
  customerLastName: string;
  phone: string;
  email: string | null;
  zoneId: number | null;
  addressStreet: string | null;
  notes: string | null;
  scheduledFor: Date | null;
  estimateMinutes: number | null;
  paymentMethod: "cash" | "card_delivery" | "card_restaurant";
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  totalBani: number;
  termsAcceptedAt: Date;
  clientIp: string | null;
  items: NewOrderItem[];
}

/** Inserts the full order atomically and returns its id (the order number). */
export async function insertOrder(order: NewOrder): Promise<number> {
  const { items, ...orderRow } = order;

  return db.transaction(async (tx) => {
    const [{ id: orderId }] = await tx.insert(orders).values(orderRow).returning({ id: orders.id });

    for (const { options, ...item } of items) {
      const [{ id: orderItemId }] = await tx
        .insert(orderItems)
        .values({ ...item, orderId })
        .returning({ id: orderItems.id });

      if (options.length > 0) {
        await tx.insert(orderItemOptions).values(options.map((option) => ({ ...option, orderItemId })));
      }
    }

    return orderId;
  });
}
