/**
 * Unit tests for the pure schedule module — fixed instants, no real clock,
 * config injected (003: values live in the DB; the math is unchanged).
 * Bucharest is UTC+3 in summer (EEST) and UTC+2 in winter (EET); both offsets
 * are covered so a UTC server clock can never skew open/closed decisions.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_SCHEDULE_CONFIG } from "@/lib/restaurant-config";
import { estimateMinutesFor, formatMinutesAsTime, isOpenAt, isValidScheduledFor, localDateKey } from "@/lib/schedule";

// the install defaults double as the reference test config (11:00–22:30, floor 11:30, 60/15/25)
const config = DEFAULT_SCHEDULE_CONFIG;

// Summer (EEST, UTC+3): local time = UTC + 3h
const summer = (utc: string) => new Date(`2026-07-04T${utc}:00Z`);
// Winter (EET, UTC+2): local time = UTC + 2h
const winter = (utc: string) => new Date(`2026-01-15T${utc}:00Z`);

describe("isOpenAt", () => {
  it("opens at 11:00 and closes after 22:30, restaurant time (summer)", () => {
    expect(isOpenAt(config, summer("07:59"))).toBe(false); // 10:59 local
    expect(isOpenAt(config, summer("08:00"))).toBe(true); // 11:00 local
    expect(isOpenAt(config, summer("19:30"))).toBe(true); // 22:30 local
    expect(isOpenAt(config, summer("19:31"))).toBe(false); // 22:31 local
  });

  it("respects the winter offset (UTC+2)", () => {
    expect(isOpenAt(config, winter("08:59"))).toBe(false); // 10:59 local
    expect(isOpenAt(config, winter("09:00"))).toBe(true); // 11:00 local
    expect(isOpenAt(config, winter("20:30"))).toBe(true); // 22:30 local
    expect(isOpenAt(config, winter("20:31"))).toBe(false); // 22:31 local
  });

  it("an edited config applies — different hours, same math", () => {
    const edited = { ...config, openMinutes: 10 * 60, closeMinutes: 23 * 60 };
    expect(isOpenAt(edited, summer("07:30"))).toBe(true); // 10:30 local
    expect(isOpenAt(edited, summer("19:45"))).toBe(true); // 22:45 local
  });
});

describe("estimateMinutesFor", () => {
  it("quotes the configured delivery estimate, the chosen option for pickup", () => {
    expect(estimateMinutesFor(config, "delivery")).toBe(60);
    expect(estimateMinutesFor(config, "pickup", 15)).toBe(15);
    expect(estimateMinutesFor(config, "pickup", 25)).toBe(25);
    expect(estimateMinutesFor(config, "pickup")).toBe(15); // default = first option
    expect(estimateMinutesFor({ ...config, deliveryEstimateMinutes: 90 }, "delivery")).toBe(90);
  });
});

describe("isValidScheduledFor", () => {
  // now = 11:00 local summer; delivery estimate 60 → earliest valid 12:00
  const nowAtOpen = summer("08:00");

  it("rejects times before now + estimate", () => {
    expect(isValidScheduledFor(config, summer("08:30"), nowAtOpen, 60)).toBe(false); // 11:30 local, too soon
    expect(isValidScheduledFor(config, summer("09:00"), nowAtOpen, 60)).toBe(true); // 12:00 local
  });

  it("never allows fulfillment before 11:30, even with a short estimate", () => {
    // now 11:00 + pickup 15 = 11:15, but the floor is 11:30
    expect(isValidScheduledFor(config, summer("08:15"), nowAtOpen, 15)).toBe(false); // 11:15 local
    expect(isValidScheduledFor(config, summer("08:30"), nowAtOpen, 15)).toBe(true); // 11:30 local
  });

  it("rejects times after closing", () => {
    const evening = summer("16:00"); // 19:00 local
    expect(isValidScheduledFor(config, summer("19:30"), evening, 60)).toBe(true); // 22:30 local
    expect(isValidScheduledFor(config, summer("19:31"), evening, 60)).toBe(false); // 22:31 local
  });

  it("rejects any other day than today, restaurant time", () => {
    // 2026-07-05T00:30 local = 2026-07-04T21:30Z — next local day even though same UTC day
    expect(isValidScheduledFor(config, new Date("2026-07-04T21:30:00Z"), nowAtOpen, 60)).toBe(false);
    // winter now, scheduled next winter day
    expect(isValidScheduledFor(config, new Date("2026-01-16T10:00:00Z"), winter("09:00"), 60)).toBe(false);
  });

  it("works across the winter offset too", () => {
    const winterNoon = winter("10:00"); // 12:00 local
    expect(isValidScheduledFor(config, winter("11:00"), winterNoon, 60)).toBe(true); // 13:00 local
    expect(isValidScheduledFor(config, winter("10:30"), winterNoon, 60)).toBe(false); // 12:30 local, too soon
  });
});

describe("display helpers", () => {
  it("localDateKey reports the restaurant-local calendar date", () => {
    // 2026-07-04T21:30Z is already 2026-07-05 00:30 in Bucharest
    expect(localDateKey(new Date("2026-07-04T21:30:00Z"))).toBe("2026-07-05");
    expect(localDateKey(summer("08:00"))).toBe("2026-07-04");
  });

  it("formatMinutesAsTime renders HH:MM", () => {
    expect(formatMinutesAsTime(660)).toBe("11:00");
    expect(formatMinutesAsTime(1350)).toBe("22:30");
    expect(formatMinutesAsTime(0)).toBe("00:00");
  });
});
