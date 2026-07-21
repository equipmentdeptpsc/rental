import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationDependencyProvider, createLocalApplicationDependencies, useApplicationDependencies } from "@/app/composition";
import { LocalStoragePersistenceAdapter, repositoryCatalog } from "@/core/persistence";
import { updateBillingInvoiceStatus } from "@/features/rental/billingstatement/services/BillingStatementWorkflow";
import type { BillingStatement } from "@/features/rental/billingstatement/types";

function statement(): BillingStatement { return { id: "statement-1", statementNo: "BS-1", version: 1, rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", customer: "Customer", project: "Project", billingFrom: "2026-07-01", billingTo: "2026-07-31", subtotal: 100, approvalStatus: "Draft", invoiceStatus: "Not Invoiced", lines: [{ deurId: "deur-1", workDate: "2026-07-01", description: "Rental", costCode: "", hours: 1, hourlyRate: 100, amount: 100 }], createdBy: "System", createdAt: "2026-07-01" }; }

describe("application composition root", () => {
  it("creates stable local dependencies and documents intentionally shared compatibility singletons", () => {
    const first = createLocalApplicationDependencies(); const second = createLocalApplicationDependencies();
    expect(first.persistence).toBeInstanceOf(LocalStoragePersistenceAdapter); expect(second.persistence).toBeInstanceOf(LocalStoragePersistenceAdapter); expect(first.persistence).not.toBe(second.persistence);
    expect(first.repositories).not.toBe(second.repositories); expect(first.repositories.rental).toBe(second.repositories.rental); expect(first.compatibility.sharedLegacySingletons).toContain("rental");
    expect(new Set(repositoryCatalog.map((item) => item.storageKey))).toContain("equipment-rental-records");
  });

  it("supports isolated repository overrides and injected feature services without local storage", () => {
    let current = statement(); let updates = 0;
    const fake = { getAll: () => [structuredClone(current)], getById: (id: string) => id === current.id ? structuredClone(current) : undefined, getByRentalId: (rentalId: string) => current.rentalId === rentalId ? [structuredClone(current)] : [], search: () => [structuredClone(current)], create: (next: BillingStatement) => { current = structuredClone(next); }, update: (next: BillingStatement) => { current = structuredClone(next); updates += 1; }, delete: (id: string) => id === current.id ? structuredClone(current) : undefined };
    const result = updateBillingInvoiceStatus(current.id, "Invoiced", fake);
    expect(result).toMatchObject({ success: true, statement: { invoiceStatus: "Invoiced" } }); expect(updates).toBe(1);
    const overridden = createLocalApplicationDependencies({ repositories: { billingStatement: fake } });
    expect(overridden.repositories.billingStatement.getById(current.id)?.invoiceStatus).toBe("Invoiced");
  });

  it("provides one dependency object to React features and fails clearly without the provider", () => {
    const dependencies = createLocalApplicationDependencies(); const observed: unknown[] = [];
    function Probe() { const value = useApplicationDependencies(); observed.push(value); return createElement("span", null, "ready"); }
    expect(renderToStaticMarkup(createElement(ApplicationDependencyProvider, { dependencies }, createElement(Probe)))).toContain("ready");
    expect(observed).toEqual([dependencies]);
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow("APPLICATION_DEPENDENCIES_MISSING");
  });
});
