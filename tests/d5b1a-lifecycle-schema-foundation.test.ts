import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { EquipmentLineLifecycleStatus, ParentRentalStatus } from "@/features/rental/types";

const sql = readFileSync(resolve("supabase/migrations/20260914000100_parent_equipment_line_lifecycle_foundation.sql"), "utf8");
const parentStatuses: ParentRentalStatus[] = ["Draft", "Reserved", "Released", "Active", "Cancelled", "Closed"];
const lineStatuses: EquipmentLineLifecycleStatus[] = ["Draft", "Reserved", "Released", "Active", "Returned", "Cancelled"];

describe("D5B1A parent and equipment-line lifecycle schema foundation", () => {
  it.each(parentStatuses)("represents canonical parent %s", (status) => {
    expect(sql).toContain(`'${status}'`);
  });

  it("keeps Returned out of the parent enum and preserves it as legacy compatibility", () => {
    const parentEnum = sql.slice(sql.indexOf("CREATE TYPE erp.rental_parent_status"), sql.indexOf(");", sql.indexOf("CREATE TYPE erp.rental_parent_status")));
    expect(parentEnum).not.toContain("'Returned'");
    expect(sql).toContain("WHEN 'Returned' THEN NULL");
  });

  it("keeps legacy Assigned parents readable without guessing a new canonical state", () => {
    expect(sql).toContain("WHEN 'Assigned' THEN NULL");
  });

  it.each(lineStatuses)("represents canonical equipment-line %s", (status) => {
    expect(sql).toContain(`'${status}'`);
  });

  it("keeps legacy Assigned and Closed lines readable without coercion", () => {
    expect(sql).toContain("WHEN 'Assigned' THEN NULL");
    expect(sql).toContain("WHEN 'Closed' THEN NULL");
  });

  it("keeps parent and line canonical status columns independent", () => {
    expect(sql).toContain("canonical_parent_status erp.rental_parent_status");
    expect(sql).toContain("canonical_line_status erp.rental_equipment_line_status");
  });

  it("adds a nullable effective start date and backfills it from the historical parent date", () => {
    expect(sql).toContain("effective_start_date date NULL");
    expect(sql).toContain("SET effective_start_date = rental.date_out");
  });

  it("replaces unconditional duplicate identity with non-deleted-line uniqueness", () => {
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS rental_equipment_lines_rental_id_equipment_id_key");
    expect(sql).toContain("uq_rental_equipment_lines_non_deleted_equipment");
    expect(sql).toContain("WHERE deleted_at IS NULL");
  });

  it("preserves existing identifiers and linked evidence by making no destructive data change", () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/UPDATE erp\.(deurs|billing_statements|billing_statement_lines|assignments)/i);
  });

  it("leaves D3/D4 functions untouched in this foundation migration", () => {
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(sql).not.toContain("check_equipment_availability");
  });

  it("retains the existing shared status columns for certified command compatibility", () => {
    expect(sql).toContain("The established shared status columns");
    expect(sql).not.toContain("ALTER COLUMN status TYPE");
  });

  it("is an additive forward-only compatibility migration", () => {
    expect(sql).toContain("ADD COLUMN canonical_parent_status");
    expect(sql).toContain("ADD COLUMN canonical_line_status");
    expect(sql).not.toContain("ALTER COLUMN status TYPE");
  });
});
