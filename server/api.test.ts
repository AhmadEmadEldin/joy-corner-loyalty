import { normalizePhone } from "./validators";

describe("normalizePhone", () => {
  it("normalizes Egyptian mobile with leading zero", () => {
    expect(normalizePhone("01012345678")).toBe("+201012345678");
  });

  it("normalizes Egyptian mobile with country code", () => {
    expect(normalizePhone("+201012345678")).toBe("+201012345678");
  });

  it("normalizes Egyptian mobile without plus", () => {
    expect(normalizePhone("201012345678")).toBe("+201012345678");
  });

  it("strips dashes and spaces", () => {
    expect(normalizePhone("+20-10-1234-5678")).toBe("+201012345678");
    expect(normalizePhone("+20 10 1234 5678")).toBe("+201012345678");
  });

  it("treats common Egyptian representations as the same phone", () => {
    expect(new Set([
      normalizePhone("01012345678"),
      normalizePhone("201012345678"),
      normalizePhone("+201012345678"),
    ])).toEqual(new Set(["+201012345678"]));
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
