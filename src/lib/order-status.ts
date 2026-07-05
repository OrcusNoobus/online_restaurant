/**
 * Order lifecycle graph (003-panou-admin research D5, 05-data-model Lifecycle).
 * Pure data + functions — the admin UI, the API validation and the tests all
 * consume this one module; no I/O, no DB. English codes everywhere, Romanian
 * labels exported for the display edge only.
 *
 *   delivery: new → accepted → in_delivery → completed
 *   pickup:   new → accepted → ready_for_pickup → completed
 *   cancel:   any non-final → canceled (reason required)
 *   undo:     one step back, derived from the latest journal event; an undo
 *             event can never itself be undone (no redo ping-pong)
 */

export type OrderStatus = "new" | "accepted" | "in_delivery" | "ready_for_pickup" | "completed" | "canceled";
export type OrderMode = "delivery" | "pickup";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "new",
  "accepted",
  "in_delivery",
  "ready_for_pickup",
  "completed",
  "canceled",
];

const FORWARD_STEP: Record<OrderMode, Partial<Record<OrderStatus, OrderStatus>>> = {
  delivery: { new: "accepted", accepted: "in_delivery", in_delivery: "completed" },
  pickup: { new: "accepted", accepted: "ready_for_pickup", ready_for_pickup: "completed" },
};

export function isFinalStatus(status: OrderStatus): boolean {
  return status === "completed" || status === "canceled";
}

/** Everything the dispatcher may do from `from` — drives the detail-panel buttons. */
export function allowedTransitions(mode: OrderMode, from: OrderStatus): OrderStatus[] {
  const targets: OrderStatus[] = [];
  const forward = FORWARD_STEP[mode][from];
  if (forward) targets.push(forward);
  if (!isFinalStatus(from)) targets.push("canceled");
  return targets;
}

export function canTransition(mode: OrderMode, from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions(mode, from).includes(to);
}

export interface TransitionRequest {
  to: OrderStatus;
  reason?: string | null;
  estimateMinutes?: number | null;
}

export type TransitionValidation =
  | { ok: true }
  | { ok: false; error: "invalid_transition" | "cancel_reason_required" | "estimate_not_allowed" };

/**
 * Semantic rules on top of the graph (06-contracts transition codes). Shape
 * rules (integer > 0, string lengths) are zod's job at the boundary.
 */
export function validateTransition(
  mode: OrderMode,
  from: OrderStatus,
  request: TransitionRequest,
): TransitionValidation {
  if (!canTransition(mode, from, request.to)) return { ok: false, error: "invalid_transition" };
  if (request.to === "canceled" && !request.reason?.trim()) {
    return { ok: false, error: "cancel_reason_required" };
  }
  if (request.estimateMinutes != null && request.to !== "accepted") {
    return { ok: false, error: "estimate_not_allowed" };
  }
  return { ok: true };
}

/** The slice of an order_status_events row the undo rule needs. */
export interface StatusEventLike {
  id: number;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  undoOfEventId: number | null;
}

export type UndoDerivation =
  | { ok: true; from: OrderStatus; to: OrderStatus; undoOfEventId: number }
  | { ok: false; error: "nothing_to_undo" };

/**
 * One step back (Q15): revert to the latest event's fromStatus via a
 * compensating event. Refused when there is no event or the latest event is
 * itself an undo — after a mistaken undo, staff moves FORWARD instead.
 */
export function deriveUndo(latestEvent: StatusEventLike | null): UndoDerivation {
  if (!latestEvent || latestEvent.undoOfEventId != null) return { ok: false, error: "nothing_to_undo" };
  return { ok: true, from: latestEvent.toStatus, to: latestEvent.fromStatus, undoOfEventId: latestEvent.id };
}

// --- Romanian labels: display edge ONLY — codes stay English in DB/API ------

export const STATUS_LABELS_RO: Record<OrderStatus, string> = {
  new: "Nouă",
  accepted: "Preluată",
  in_delivery: "În livrare",
  ready_for_pickup: "Gata de ridicare",
  completed: "Finalizată",
  canceled: "Anulată",
};

/** Button label for the transition INTO each status. */
export const TRANSITION_ACTION_LABELS_RO: Record<OrderStatus, string> = {
  new: "Marchează ca nouă",
  accepted: "Preia comanda",
  in_delivery: "Trimite în livrare",
  ready_for_pickup: "Gata de ridicare",
  completed: "Finalizează",
  canceled: "Anulează",
};
