import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/booking/components/CanonicalBookingOperationsWorkspace.tsx", "utf8");

describe("booking calendar presentation", () => {
  it("distinguishes adjacent months without using business status colors", () => {
    expect(source).toContain("const inMonth = date.slice(0, 7) === anchor.slice(0, 7)");
    expect(source).toContain("bg-slate-50/70");
    expect(source).toContain("bg-amber-50");
  });

  it("keeps month heading, navigation, and Today behavior data-driven", () => {
    expect(source).toContain("monthLabel(anchor)");
    expect(source).toContain("setAnchor(today)");
    expect(source).toContain("direction * 32");
    expect(source).not.toContain("September 2026");
  });
});
