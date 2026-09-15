import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/DailyLogs.tsx", "utf8");

describe("Daily Logs canonical remote UI", () => {
  it("uses the canonical DEUR read boundary in remote mode", () => {
    expect(source).toContain("PersistenceMode.Remote");
    expect(source).toContain("readRepositories.deurs.list()");
    expect(source).toContain("Canonical Digital Equipment Utilization Records");
    expect(source).not.toContain("useDailyLog");
  });

  it("links records to the existing Rental DEUR workspace without adding a write workflow", () => {
    expect(source).toContain("/workspace?tab=deur");
    expect(source).toContain("Open Rental DEUR");
    expect(source).not.toContain("New Daily Log");
  });
});
