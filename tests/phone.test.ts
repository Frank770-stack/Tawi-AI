import { describe, expect, it } from "vitest";
import { formatPhone, normalizeKenyanPhone } from "@/lib/phone";

describe("normalizeKenyanPhone", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["712345678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["+254 712 345 678", "+254712345678"],
    ["0712-345-678", "+254712345678"],
    ["0112345678", "+254112345678"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0812345678", "+255712345678", "07123456789", "07123abc78", "+2540712345678"])(
    "rejects %j",
    (input) => {
      expect(normalizeKenyanPhone(input)).toBeNull();
    },
  );
});

describe("formatPhone", () => {
  it("shows the local format", () => {
    expect(formatPhone("+254712345678")).toBe("0712 345 678");
  });
});
