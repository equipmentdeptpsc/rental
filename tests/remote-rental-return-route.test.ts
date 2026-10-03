import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacyReturnPage = readFileSync("src/pages/Rental/Return.tsx", "utf8");
const remoteReturnPage = readFileSync("src/features/rental/remote/RemoteRentalReturnPage.tsx", "utf8");

describe("remote Rental return route", () => {
  it("resolves the route UUID through canonical reads and reuses the narrow canonical return action", () => {
    expect(legacyReturnPage).toContain("configuration.persistenceMode === PersistenceMode.Remote");
    expect(legacyReturnPage).toContain("<RemoteRentalReturnPage rentalId={id ?? \"\"} />");
    expect(remoteReturnPage).toContain("useRentalListData(fallback)");
    expect(remoteReturnPage).toContain("item.id === rentalId");
    expect(remoteReturnPage).toContain("<RentalQuickActions rental={rental} hideClose />");
  });

  it("fails closed when the canonical tenant-scoped list does not contain the requested UUID", () => {
    expect(remoteReturnPage).toContain("if (!rental) return <main className=\"p-8\">Rental not found.</main>");
  });
});
