import { describe, expect, it } from "vitest";
import { buildManagementAnalytics, type DashboardManagementSource } from "@/features/dashboard/services/managementAnalytics";
import { comparisonPeriod, dashboardPeriod } from "@/features/dashboard/services/managementPeriods";

const now = new Date("2026-10-08T12:00:00Z");
const period = { from: "2026-10-01", to: "2026-10-08" };
const source = (patch: Partial<DashboardManagementSource> = {}): DashboardManagementSource => ({ equipment: [], assignments: [], rentals: [], rentalLines: [], projects: [], deurs: [], statements: [], collections: [], ...patch });
const rows = <T>(items: object[]) => items as T[];

describe("dashboard management periods", () => {
  it("handles month, quarter, year, custom and equal-length previous windows", () => {
    expect(dashboardPeriod("this-month", now)).toEqual(period);
    expect(dashboardPeriod("last-month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(dashboardPeriod("this-quarter", now)).toEqual(period);
    expect(dashboardPeriod("last-quarter", now)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(dashboardPeriod("this-year", now)).toEqual({ from: "2026-01-01", to: "2026-10-08" });
    expect(dashboardPeriod("custom", now, { from: "2026-04-02", to: "2026-04-04" })).toEqual({ from: "2026-04-02", to: "2026-04-04" });
    expect(comparisonPeriod(period, "previous")).toEqual({ from: "2026-09-23", to: "2026-09-30" });
    expect(comparisonPeriod(period, "last-year")).toEqual({ from: "2025-10-01", to: "2025-10-08" });
  });
});

describe("dashboard management analytics", () => {
  it("counts current fleet deployment once and excludes inactive or deleted assets", () => {
    const equipment = rows<DashboardManagementSource["equipment"][number]>([
      { id: "e1", status: "Assigned", active: true }, { id: "e2", status: "Rented", active: true },
      { id: "e3", status: "Available", active: true }, { id: "e4", status: "Maintenance", active: true },
      { id: "e5", status: "Rented", active: false }, { id: "e6", status: "Assigned", active: true, deletedAt: "2026-01-01" },
    ]);
    expect(buildManagementAnalytics(source({ equipment }), period, "previous", now).fleet).toMatchObject({ total: 4, assigned: 1, deployed: 1, utilized: 2, rate: 50 });
    expect(buildManagementAnalytics(source(), period, "previous", now).fleet.rate).toBe(0);
  });

  it("separates invoiced amount from collections and compares previous and last-year periods", () => {
    const statements = rows<DashboardManagementSource["statements"][number]>([
      { id: "s1", rentalId: "r1", billingTo: "2026-10-06", grandTotal: 1000, invoiceStatus: "Invoiced", lines: [] },
      { id: "s2", rentalId: "r1", billingTo: "2026-09-27", grandTotal: 500, invoiceStatus: "Invoiced", lines: [] },
      { id: "s3", rentalId: "r1", billingTo: "2025-10-06", grandTotal: 250, invoiceStatus: "Invoiced", lines: [] },
      { id: "s4", rentalId: "r1", billingTo: "2026-10-07", grandTotal: 999, invoiceStatus: "Cancelled", lines: [] },
    ]);
    const collections = rows<DashboardManagementSource["collections"][number]>([
      { id: "c1", rentalId: "r1", statementId: "s1", paymentDate: "2026-10-07", amount: 300 },
      { id: "c2", rentalId: "r1", statementId: "s2", paymentDate: "2026-10-07", amount: 200 },
      { id: "c3", rentalId: "r1", statementId: "s2", paymentDate: "2026-09-27", amount: 100 },
      { id: "bad", rentalId: "other", statementId: "s1", paymentDate: "2026-10-07", amount: 900 },
    ]);
    const data = source({ statements, collections });
    const current = buildManagementAnalytics(data, period, "previous", now);
    expect(current).toMatchObject({ revenue: 1000, collections: 500, outstanding: 1150, collectionRealization: 50 });
    expect(current.revenueChange.percent).toBe(100);
    expect(current.collectionsChange.percent).toBe(400);
    expect(buildManagementAnalytics(data, period, "last-year", now).revenueChange.percent).toBe(300);
    expect(buildManagementAnalytics(source(), period, "previous", now).revenueChange.label).toBe("No prior activity");
  });

  it("ranks customer, project and reconciled equipment by selected-period invoiced amount", () => {
    const equipment = rows<DashboardManagementSource["equipment"][number]>([{ id: "e1", assetNo: "A1", equipmentName: "Excavator", status: "Rented", active: true }]);
    const rentals = rows<DashboardManagementSource["rentals"][number]>([{ id: "r1", customerId: "c1", customer: "Acme", projectId: "p1", project: "Bridge", status: "Active" }]);
    const projects = rows<DashboardManagementSource["projects"][number]>([{ id: "p1", projectCode: "BR-1", projectName: "Bridge" }]);
    const statements = rows<DashboardManagementSource["statements"][number]>([{ id: "s1", rentalId: "r1", billingTo: "2026-10-06", grandTotal: 1000, invoiceStatus: "Invoiced", lines: [{ equipmentId: "e1", grandTotal: 1000 }] }]);
    const analytics = buildManagementAnalytics(source({ equipment, rentals, projects, statements }), period, "previous", now);
    expect(analytics.topCustomers[0]).toMatchObject({ label: "Acme", amount: 1000, href: "/rentals?r_customer=c1" });
    expect(analytics.topProjects[0].label).toContain("Bridge");
    expect(analytics.topRevenueEquipment[0]).toMatchObject({ label: "A1 - Excavator", amount: 1000 });
    expect(buildManagementAnalytics(source({ equipment, rentals, projects, statements: rows([{ ...statements[0], lines: [{ equipmentId: "e1", grandTotal: 900 }] }]) }), period, "previous", now).topRevenueEquipment).toEqual([]);
  });

  it("uses measured idle and operation minutes, excluding standby, and orders supported attention", () => {
    const equipment = rows<DashboardManagementSource["equipment"][number]>([{ id: "e1", assetNo: "A1", equipmentName: "Excavator", status: "Rented", active: true }]);
    const rentals = rows<DashboardManagementSource["rentals"][number]>([{ id: "r1", rentalNumber: "RN-1", status: "Active", expectedReturn: "2026-10-01", equipmentId: "e1" }]);
    const rentalLines = rows<DashboardManagementSource["rentalLines"][number]>([{ id: "l1", rentalId: "r1", equipmentId: "e1", status: "Active", operatorId: "" }]);
    const deurs = rows<DashboardManagementSource["deurs"][number]>([{ id: "d1", equipmentId: "e1", workDate: "2026-10-03", status: "Acknowledged", totals: { operationMinutes: 60, idleMinutes: 90, standbyMinutes: 500 } }]);
    const analytics = buildManagementAnalytics(source({ equipment, rentals, rentalLines, deurs }), period, "previous", now);
    expect(analytics.idleHeavyEquipment[0]).toMatchObject({ operationHours: 1, idleHours: 1.5, percent: 60 });
    expect(analytics.attention.map((item) => item.issue)).toEqual(["Return overdue", "Operator not assigned", "High measured idle share"]);
    expect(analytics.attention[0].severity).toBe("high");
  });
});
