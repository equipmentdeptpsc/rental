import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const operators = readFileSync("src/pages/Operators/index.tsx", "utf8");
const operatorData = readFileSync("src/features/operators/hooks/useCanonicalOperatorData.ts", "utf8");
const users = readFileSync("src/features/users/pages/UsersPage.tsx", "utf8");

describe("Milestone 10A Operators and Users presentation", () => {
  it("keeps canonical Operators read-only while exposing readable identity and filters", () => {
    expect(operators).toContain("PageHeader");
    expect(operators).toContain("FilterBar");
    expect(operators).toContain("StatusBadge");
    expect(operators).toContain("Linked login");
    expect(operators).toContain("Read-only canonical view");
    expect(operatorData).toContain("linkedUsername");
    expect(operatorData).toContain("assignmentCount");
  });

  it("preserves credential masking and reset permission gating", () => {
    expect(users).toContain('users.password.reset');
    expect(users).toContain('aria-label={resetVisible?"Hide credential":"Show credential"}');
    expect(users).toContain('type="password"');
    expect(users).toContain("system-administrator");
  });
});
