import { describe, expect, it } from "vitest";
import { assertBani, formatBani } from "@/lib/money";

describe("formatBani", () => {
  it("formats whole lei", () => {
    expect(formatBani(500)).toBe("5,00 lei");
  });

  it("formats lei with bani", () => {
    expect(formatBani(2990)).toBe("29,90 lei");
    expect(formatBani(10490)).toBe("104,90 lei");
  });

  it("formats zero", () => {
    expect(formatBani(0)).toBe("0,00 lei");
  });

  it("formats negative amounts (refunds/discounts)", () => {
    expect(formatBani(-1550)).toBe("-15,50 lei");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatBani(29.9)).toThrow(TypeError);
    expect(() => formatBani(Number.NaN)).toThrow(TypeError);
  });
});

describe("assertBani", () => {
  it("accepts safe integers", () => {
    expect(() => assertBani(0)).not.toThrow();
    expect(() => assertBani(14990)).not.toThrow();
  });

  it("rejects floats and unsafe values", () => {
    expect(() => assertBani(0.1)).toThrow(TypeError);
    expect(() => assertBani(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
  });
});
