/**
 * Unit tests for the pure schedule module — fixed instants, no real clock.
 * Bucharest is UTC+3 in summer (EEST) and UTC+2 in winter (EET); both offsets
 * are covered so a UTC server clock can never skew open/closed decisions.
 */
import { describe, expect, it } from "vitest";

import { estimateMinutesFor, isOpenAt, isValidScheduledFor } from "@/lib/schedule";

// Summer (EEST, UTC+3): local time = UTC + 3h
const summer = (utc: string) => new Date(`2026-07-04T${utc}:00Z`);
// Winter (EET, UTC+2): local time = UTC + 2h
const winter = (utc: string) => new Date(`2026-01-15T${utc}:00Z`);

describe("isOpenAt", () => {
  it("opens at 11:00 and closes after 22:30, restaurant time (summer)", () => {
    expect(isOpenAt(summer("07:59"))).toBe(false); // 10:59 local
    expect(isOpenAt(summer("08:00"))).toBe(true); // 11:00 local
    expect(isOpenAt(summer("19:30"))).toBe(true); // 22:30 local
    expect(isOpenAt(summer("19:31"))).toBe(false); // 22:31 local
  });

  it("respects the winter offset (UTC+2)", () => {
    expect(isOpenAt(winter("08:59"))).toBe(false); // 10:59 local
    expect(isOpenAt(winter("09:00"))).toBe(true); // 11:00 local
    expect(isOpenAt(winter("20:30"))).toBe(true); // 22:30 local
    expect(isOpenAt(winter("20:31"))).toBe(false); // 22:31 local
  });
});

describe("estimateMinutesFor", () => {
  it("quotes 60 minutes for delivery, the chosen 15/25 for pickup", () => {
    expect(estimateMinutesFor("delivery")).toBe(60);
    expect(estimateMinutesFor("pickup", 15)).toBe(15);
    expect(estimateMinutesFor("pickup", 25)).toBe(25);
    expect(estimateMinutesFor("pickup")).toBe(15); // default = first option
  });
});

describe("isValidScheduledFor", () => {
  // now = 11:00 local summer; delivery estimate 60 → earliest valid 12:00
  const nowAtOpen = summer("08:00");

  it("rejects times before now + estimate", () => {
    expect(isValidScheduledFor(summer("08:30"), nowAtOpen, 60)).toBe(false); // 11:30 local, too soon
    expect(isValidScheduledFor(summer("09:00"), nowAtOpen, 60)).toBe(true); // 12:00 local
  });

  it("never allows fulfillment before 11:30, even with a short estimate", () => {
    // now 11:00 + pickup 15 = 11:15, but the floor is 11:30
    expect(isValidScheduledFor(summer("08:15"), nowAtOpen, 15)).toBe(false); // 11:15 local
    expect(isValidScheduledFor(summer("08:30"), nowAtOpen, 15)).toBe(true); // 11:30 local
  });

  it("rejects times after closing", () => {
    const evening = summer("16:00"); // 19:00 local
    expect(isValidScheduledFor(summer("19:30"), evening, 60)).toBe(true); // 22:30 local
    expect(isValidScheduledFor(summer("19:31"), evening, 60)).toBe(false); // 22:31 local
  });

  it("rejects any other day than today, restaurant time", () => {
    // 2026-07-05T00:30 local = 2026-07-04T21:30Z — next local day even though same UTC day
    expect(isValidScheduledFor(new Date("2026-07-04T21:30:00Z"), nowAtOpen, 60)).toBe(false);
    // winter now, scheduled next winter day
    expect(isValidScheduledFor(new Date("2026-01-16T10:00:00Z"), winter("09:00"), 60)).toBe(false);
  });

  it("works across the winter offset too", () => {
    const winterNoon = winter("10:00"); // 12:00 local
    expect(isValidScheduledFor(winter("11:00"), winterNoon, 60)).toBe(true); // 13:00 local
    expect(isValidScheduledFor(winter("10:30"), winterNoon, 60)).toBe(false); // 12:30 local, too soon
  });
});
