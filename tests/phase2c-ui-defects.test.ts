import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Button from "@/components/ui/Button";
import { hasDistinctLineCommercialTerms } from "@/features/rental/workspace/overview/commercialTermsPresentation";
import { exportReportPdf, reportPdfFilename } from "@/features/reports/services/reportPdfExport";
import type { RentalCommercialSnapshot } from "@/features/rental/types";

const snapshot: RentalCommercialSnapshot = {
  billingMethod: "Per Hour", unitRate: 1250, contractAmount: 50_000,
  operatorIncluded: true, currency: "PHP", capturedAt: "2026-08-14T00:00:00.000Z",
};

describe("Phase 2C UI defect contracts", () => {
  it("suppresses duplicated rental-level terms while preserving legitimate line terms", () => {
    const unchanged = structuredClone(snapshot);
    expect(
      hasDistinctLineCommercialTerms(
        { ...snapshot, capturedAt: "2026-08-14T09:30:00.000Z" },
        snapshot,
      ),
    ).toBe(false);
    expect(hasDistinctLineCommercialTerms({ ...snapshot, unitRate: 1500 }, snapshot)).toBe(true);
    expect(hasDistinctLineCommercialTerms(snapshot, undefined)).toBe(true);
    expect(hasDistinctLineCommercialTerms(undefined, snapshot)).toBe(false);
    expect(snapshot).toEqual(unchanged);
  });

  it("provides readable dark secondary actions with focus and disabled states", () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: "secondary", disabled: true }, "View"));
    expect(html).toContain("dark:text-slate-100");
    expect(html).toContain("dark:border-slate-500");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("disabled:opacity-45");
  });

  it("uses the required deterministic report filename and rejects empty exports safely", async () => {
    expect(reportPdfFilename("Rental Report", new Date("2026-08-14T00:00:00.000Z"))).toBe("equipment-rental-rental-report-2026-08-14.pdf");
    await expect(exportReportPdf({ title: "Rental Report", period: "All dates", filters: [], columns: ["Status"], rows: [], generatedAt: new Date("2026-08-14T00:00:00.000Z"), generatedBy: "Admin" })).rejects.toThrow("No report rows");
  });
});
