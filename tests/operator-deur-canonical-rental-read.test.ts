import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hook=readFileSync("src/features/rental/deur/operator/useOperatorDeurData.ts","utf8");

describe("Operator DEUR canonical Rental projection",()=>{
  it("uses the same tenant-authorized list boundary as the Operator landing",()=>{
    expect(hook).toContain('readRepositories.rentals.list({ filters: { id: rentalId }, paging: { limit: 2 } })');
    expect(hook).not.toContain("readRepositories.rentals.getById(rentalId)");
    expect(hook).toContain("rentals.value.items.find((item) => item.id === rentalId)");
  });
});
