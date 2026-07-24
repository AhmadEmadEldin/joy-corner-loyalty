import { normalizePhone } from "./validators";

describe("normalizePhone", () => {
  it("normalizes Egyptian mobile with leading zero", () => {
    expect(normalizePhone("01234567890")).toBe("+01234567890");
  });

  it("normalizes Egyptian mobile with country code", () => {
    expect(normalizePhone("+201234567890")).toBe("+201234567890");
  });

  it("normalizes Egyptian mobile without plus", () => {
    expect(normalizePhone("201234567890")).toBe("+201234567890");
  });

  it("strips dashes and spaces", () => {
    expect(normalizePhone("+20-123-456-7890")).toBe("+201234567890");
    expect(normalizePhone("+20 123 456 7890")).toBe("+201234567890");
  });

  it("returns null for too short input", () => {
    expect(normalizePhone("12345")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for non-numeric after stripping", () => {
    expect(normalizePhone("abcdefghij")).toBeNull();
  });

  it("handles 15-digit international numbers", () => {
    expect(normalizePhone("+123456789012345")).toBe("+123456789012345");
  });
});
