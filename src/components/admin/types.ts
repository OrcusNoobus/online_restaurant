/**
 * Client-side mirror of the admin orders JSON contract
 * (003 06-contracts Orders). Defined here — NOT imported from server code —
 * because src/components must stay free of server imports (init.sh boundary
 * check); dates are the ISO strings the API actually sends.
 */
import type { OrderMode, OrderStatus } from "@/lib/order-status";

export type PaymentMethod = "cash" | "card_delivery" | "card_restaurant";

export interface OrderListEntry {
  id: number;
  createdAt: string;
  mode: OrderMode;
  status: OrderStatus;
  customerName: string;
  phone: string;
  zoneName: string | null;
  scheduledFor: string | null;
  estimateMinutes: number | null;
  paymentMethod: PaymentMethod;
  totalBani: number;
}

export interface DayTotals {
  count: number;
  totalBani: number;
  canceledCount: number;
}

export interface DayView {
  date: string;
  orders: OrderListEntry[];
  totals: DayTotals;
}

export interface OrderDetailPayload {
  order: {
    id: number;
    createdAt: string;
    mode: OrderMode;
    status: OrderStatus;
    customerFirstName: string;
    customerLastName: string;
    phone: string;
    email: string | null;
    zoneId: number | null;
    zoneName: string | null;
    addressStreet: string | null;
    notes: string | null;
    scheduledFor: string | null;
    estimateMinutes: number | null;
    paymentMethod: PaymentMethod;
    subtotalBani: number;
    sgrBani: number;
    deliveryFeeBani: number;
    totalBani: number;
    termsAcceptedAt: string;
    clientIp: string | null;
  };
  items: {
    id: number;
    productId: number;
    variantId: number;
    productName: string;
    variantName: string | null;
    unitPriceBani: number;
    quantity: number;
    lineTotalBani: number;
    options: {
      groupName: string;
      toppingName: string;
      priceBani: number;
      sgrDepositBani: number;
    }[];
  }[];
  events: {
    id: number;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    reason: string | null;
    staffDisplayName: string;
    undoOfEventId: number | null;
    createdAt: string;
  }[];
}
