import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hook = readFileSync("src/features/equipment/hooks/useCanonicalEquipmentDetail.ts", "utf8");
const detail = readFileSync("src/pages/Equipment/Details.tsx", "utf8");
const listPage = readFileSync("src/pages/Equipment/index.tsx", "utf8");

describe("recent DEUR activity detail contract", () => {
  it("uses an equipment-scoped server query with deterministic ordering and a bounded page", () => {
    expect(hook).toContain('readRepositories.deurs.list({ filters: { equipment_id: id }');
    expect(hook).toContain('{ field: "work_date", ascending: false }');
    expect(hook).toContain('{ field: "created_at", ascending: false }');
    expect(hook).toContain('paging: { limit: 5 }');
    expect(hook).not.toContain("readRepositories.deurs.list() });");
  });

  it("keeps the section permission gated and labels optional", () => {
    expect(hook).toContain('hasPermission("deur.read")');
    expect(hook).toContain('hasPermission("operator.read")');
    expect(hook).toContain('hasPermission("project.read")');
    expect(detail).toContain("Recent DEUR Activity");
    expect(detail).toContain("No recent DEUR activity");
    expect(detail).toContain("Operating");
    expect(detail).toContain("Submitted");
    expect(detail).not.toContain("record.operatorId");
    expect(detail).not.toContain("record.projectId");
  });

  it("does not add DEUR reads to the equipment list surface", () => {
    expect(listPage).not.toContain("readRepositories.deurs");
    expect(listPage).not.toContain("Recent DEUR Activity");
  });
});
