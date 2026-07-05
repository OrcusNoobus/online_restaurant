/** Unit tests for the pure order lifecycle graph (003 research D5) — no DB. */
import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  canTransition,
  deriveUndo,
  isFinalStatus,
  ORDER_STATUSES,
  type OrderStatus,
  STATUS_LABELS_RO,
  type StatusEventLike,
  TRANSITION_ACTION_LABELS_RO,
  validateTransition,
} from "@/lib/order-status";

describe("transition graph", () => {
  it("delivery happy path: new → accepted → in_delivery → completed", () => {
    expect(canTransition("delivery", "new", "accepted")).toBe(true);
    expect(canTransition("delivery", "accepted", "in_delivery")).toBe(true);
    expect(canTransition("delivery", "in_delivery", "completed")).toBe(true);
  });

  it("pickup happy path: new → accepted → ready_for_pickup → completed", () => {
    expect(canTransition("pickup", "new", "accepted")).toBe(true);
    expect(canTransition("pickup", "accepted", "ready_for_pickup")).toBe(true);
    expect(canTransition("pickup", "ready_for_pickup", "completed")).toBe(true);
  });

  it("modes never borrow each other's steps", () => {
    expect(canTransition("delivery", "accepted", "ready_for_pickup")).toBe(false);
    expect(canTransition("pickup", "accepted", "in_delivery")).toBe(false);
  });

  it("steps cannot be skipped or reversed directly", () => {
    expect(canTransition("delivery", "new", "in_delivery")).toBe(false);
    expect(canTransition("delivery", "new", "completed")).toBe(false);
    expect(canTransition("delivery", "in_delivery", "accepted")).toBe(false);
    expect(canTransition("pickup", "new", "ready_for_pickup")).toBe(false);
  });

  it("cancel is allowed from every non-final state, in both modes", () => {
    const nonFinal: OrderStatus[] = ["new", "accepted", "in_delivery", "ready_for_pickup"];
    for (const from of nonFinal) {
      expect(canTransition("delivery", from, "canceled")).toBe(true);
      expect(canTransition("pickup", from, "canceled")).toBe(true);
    }
  });

  it("final states have no forward transitions at all", () => {
    for (const from of ["completed", "canceled"] as const) {
      expect(isFinalStatus(from)).toBe(true);
      expect(allowedTransitions("delivery", from)).toEqual([]);
      expect(allowedTransitions("pickup", from)).toEqual([]);
    }
  });

  it("allowedTransitions lists the forward step plus cancel", () => {
    expect(allowedTransitions("delivery", "accepted")).toEqual(["in_delivery", "canceled"]);
    expect(allowedTransitions("pickup", "accepted")).toEqual(["ready_for_pickup", "canceled"]);
    expect(allowedTransitions("delivery", "new")).toEqual(["accepted", "canceled"]);
  });
});

describe("validateTransition semantic rules", () => {
  it("accepts a plain valid step", () => {
    expect(validateTransition("delivery", "new", { to: "accepted" })).toEqual({ ok: true });
  });

  it("refuses a graph-invalid step with invalid_transition", () => {
    expect(validateTransition("pickup", "new", { to: "in_delivery" })).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  it("cancel requires a non-empty reason", () => {
    expect(validateTransition("delivery", "new", { to: "canceled" })).toEqual({
      ok: false,
      error: "cancel_reason_required",
    });
    expect(validateTransition("delivery", "new", { to: "canceled", reason: "   " })).toEqual({
      ok: false,
      error: "cancel_reason_required",
    });
    expect(validateTransition("delivery", "new", { to: "canceled", reason: "clientul nu răspunde" })).toEqual({
      ok: true,
    });
  });

  it("estimate is allowed only on the transition into accepted", () => {
    expect(validateTransition("delivery", "new", { to: "accepted", estimateMinutes: 45 })).toEqual({ ok: true });
    expect(validateTransition("delivery", "accepted", { to: "in_delivery", estimateMinutes: 45 })).toEqual({
      ok: false,
      error: "estimate_not_allowed",
    });
    expect(validateTransition("pickup", "accepted", { to: "canceled", reason: "x", estimateMinutes: 10 })).toEqual({
      ok: false,
      error: "estimate_not_allowed",
    });
  });
});

describe("undo derivation (one step back, never of an undo)", () => {
  const event = (partial: Partial<StatusEventLike>): StatusEventLike => ({
    id: 1,
    fromStatus: "new",
    toStatus: "accepted",
    undoOfEventId: null,
    ...partial,
  });

  it("reverts the latest normal event to its fromStatus", () => {
    expect(deriveUndo(event({ id: 7, fromStatus: "accepted", toStatus: "in_delivery" }))).toEqual({
      ok: true,
      from: "in_delivery",
      to: "accepted",
      undoOfEventId: 7,
    });
  });

  it("works for cancel too — the otherwise-lost prior state comes back", () => {
    expect(deriveUndo(event({ id: 9, fromStatus: "ready_for_pickup", toStatus: "canceled" }))).toEqual({
      ok: true,
      from: "canceled",
      to: "ready_for_pickup",
      undoOfEventId: 9,
    });
  });

  it("refuses when the order has no events", () => {
    expect(deriveUndo(null)).toEqual({ ok: false, error: "nothing_to_undo" });
  });

  it("refuses to undo an undo — no redo ping-pong", () => {
    expect(deriveUndo(event({ id: 11, fromStatus: "canceled", toStatus: "ready_for_pickup", undoOfEventId: 9 }))).toEqual(
      { ok: false, error: "nothing_to_undo" },
    );
  });
});

describe("Romanian labels at the edge", () => {
  it("every status has a status label and an action label", () => {
    for (const status of ORDER_STATUSES) {
      expect(STATUS_LABELS_RO[status]).toBeTruthy();
      expect(TRANSITION_ACTION_LABELS_RO[status]).toBeTruthy();
    }
  });
});
