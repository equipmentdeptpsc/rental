import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import { billingStatementPdfText, generateBillingStatementPdf } from "@/features/rental/billing-email/generateBillingStatementPdf";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { EquipmentRecord } from "@/features/equipment/types";

const sql = readFileSync("supabase/migrations/20261011000300_canonical_equipment_dual_numbering.sql", "utf8");
const form = readFileSync("src/features/equipment/components/RemoteEquipmentForm.tsx", "utf8");
const previous = readFileSync("supabase/migrations/20260828000100_canonical_billing_lineage_integrity.sql", "utf8");

describe("canonical Equipment dual-numbering migration", () => {
  it("uses the approved category IDs and local prefix formats without browser allocation", () => {
    for (const [id, prefix] of [
      ["d4c032dc-dc09-5a24-87c5-e663645f75ba", "ME"],
      ["ab695f74-6bc3-56e7-87a8-6ee851a2adc1", "NME"],
      ["ab58d0c5-5b24-5dd6-a105-b90a30202a3f", "AE"],
      ["c335be47-3619-5d15-8931-ba77bdfd715e", "LE"],
    ]) { expect(sql).toContain(`'${id}'`); expect(sql).toContain(`'${prefix}',6`); }
    expect(sql).toContain("UPDATE erp.equipment_asset_sequences s SET next_number=greatest");
    expect(sql).toContain("max((substring(e.asset_no");
    expect(sql).toContain("RETURNING s.prefix_code||'-'||lpad");
    expect(form).not.toContain("assetNo: form.");
    expect(form).toContain('label="Asset Number" readOnly');
  });
  it("keeps both identifiers unique after soft deletion and validates active masters", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX uq_equipment_asset_no_issued ON erp.equipment(lower(btrim(asset_no)))");
    expect(sql).toContain("CREATE UNIQUE INDEX uq_equipment_legacy_number_issued");
    expect(sql).toContain("lower(regexp_replace(btrim(legacy_equipment_number)");
    expect(sql).not.toMatch(/uq_equipment_legacy_number_issued[^;]*deleted_at/);
    for (const table of ["equipment_categories", "equipment_subcategories", "cost_codes", "equipment_brands", "equipment_models", "equipment_ownerships", "equipment_locations", "equipment_conditions"]) expect(sql).toContain(`erp.${table}`);
    expect(sql).toContain("m.company_id=tenant AND m.active");
    expect(sql).toContain("current_user_has_permission('equipment.create')");
    expect(sql).toContain("u.status='active'");
    expect(sql).toContain("read_equipment_registration_master_projection");
    expect(sql).toContain("caller.status='active' AND caller.company_id=equipment.company_id");
    expect(sql).toContain("WITH (security_invoker=true)");
    expect(sql).not.toContain("LEFT JOIN erp.cost_codes cost_code ON");
  });
  it("retains idempotency, audit, restricted grants and immutable historical billing rows", () => {
    for (const phrase of ["begin_operational_command", "finish_operational_command", "EQUIPMENT_CREATED", "LEGACY_NUMBER_CONFLICT", "EQUIPMENT_ID_CONFLICT", "ASSET_PREFIX_NOT_CONFIGURED", "REVOKE INSERT,UPDATE,DELETE ON erp.equipment"]) expect(sql).toContain(phrase);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.command_create_equipment");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.read_canonical_equipment_reference_data");
    expect(sql).toContain("'legacyEquipmentNumber',equipment_record.legacy_equipment_number");
    expect(sql).not.toMatch(/UPDATE erp\.billing_statement_lines/i);
    expect(previous).toContain("BEFORE INSERT ON erp.billing_statement_lines");
    expect(previous).toContain("BILLING_LINEAGE_IMMUTABLE");
  });
});

describe("immutable Billing Statement identifier presentation", () => {
  const equipment: EquipmentRecord = { id: "e1", prefixId: "prefix-moving-equipment", assetNo: "ME-999999", legacyEquipmentNumber: "LIVE-NEW", equipmentName: "Renamed", category: "Moving Equipment", status: "Rented", maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "" };
  function statement(snapshot: BillingStatement["lines"][number]["equipmentSnapshot"]): BillingStatement {
    return { id: "s1", statementNo: "BS-1", version: 1, rentalId: "r1", rentalNumber: "R-1", equipmentId: "e1", operatorId: "o1", customer: "Test Customer", project: "Test Project", billingFrom: "2026-10-01", billingTo: "2026-10-01", subtotal: 200, grandTotal: 200, approvalStatus: "Approved", invoiceStatus: "Invoiced", createdBy: "system", createdAt: "2026-10-01T00:00:00Z", lines: [{ id: "l1", deurId: "d1", rentalEquipmentLineId: "rl1", equipmentId: "e1", operatorId: "o1", equipmentSnapshot: snapshot, workDate: "2026-10-01", description: "Operation", costCode: "C1", hours: 2, hourlyRate: 100, amount: 200 }] };
  }
  it("prints both frozen identifiers without changing quantity or totals", () => {
    const document = buildInvoiceDocument(statement({ id: "e1", assetNo: "ME-000123", legacyEquipmentNumber: "OLD 123", name: "Original" }), [equipment]);
    expect(document.serviceLines[0]).toMatchObject({ equipmentCode: "ME-000123", equipmentLegacyCode: "OLD 123", quantityLabel: "1 service", amount: 200 });
    expect(document).toMatchObject({ subtotal: 200, grandTotal: 200 });
    expect(billingStatementPdfText(document).join("\n")).toContain("Legacy OLD 123");
    expect(new TextDecoder().decode(generateBillingStatementPdf(document))).toContain("Legacy OLD 123");
  });
  it("does not invent a legacy number on historical snapshots", () => {
    const document = buildInvoiceDocument(statement({ id: "e1", assetNo: "ME-000123", name: "Original" }), [equipment]);
    expect(document.serviceLines[0].equipmentLegacyCode).toBeUndefined();
    expect(billingStatementPdfText(document).join("\n")).not.toContain("LIVE-NEW");
  });
});
