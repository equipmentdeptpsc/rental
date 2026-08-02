import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const foundationPath = path.resolve("supabase/migrations/20260722000100_foundation.sql");
const originalPath = path.resolve("supabase/migrations/20260802003500_phase_c7_deur_release_readiness_gate.sql");
const correctionPath = path.resolve("supabase/migrations/20260802003600_phase_c7_project_readiness_schema_correction.sql");
const foundationSql = fs.readFileSync(foundationPath, "utf8");
const originalSql = fs.readFileSync(originalPath, "utf8");
const correctionSql = fs.readFileSync(correctionPath, "utf8");

describe("C7 project readiness schema correction", () => {
  it("uses the canonical active and soft-delete columns without inventing a project status", () => {
    expect(foundationSql).toMatch(/CREATE TABLE projects[\s\S]*active boolean NOT NULL DEFAULT true, deleted_at timestamptz/);
    expect(correctionSql).toContain("CASE WHEN p.id IS NULL OR NOT p.active THEN 'project' END");
    expect(correctionSql).toContain("p.company_id=tenant AND p.deleted_at IS NULL");
    expect(correctionSql).not.toMatch(/\b(?:projects|p)\.status\b/);
    expect(correctionSql).not.toMatch(/\b(?:is_active|archived_at)\b/);
  });

  it("is forward-only and leaves the applied 03500 definition as historical evidence", () => {
    expect(path.basename(correctionPath)).toMatch(/^20260802003600_/);
    expect(originalSql).toContain("p.status<>'Active'");
    expect(crypto.createHash("sha256").update(originalSql).digest("hex")).toBe(
      "a0cdea1f691a98ad97902c51ce57bedbcd72196f8491ce5bf846a928d4726c00",
    );
    expect(correctionSql).not.toMatch(/(?:DROP|ALTER)\s+TABLE/i);
    expect(correctionSql).not.toContain("FUNCTION command_release_rental");
  });

  it("preserves authorization, tenant scoping, structured results, ownership, grants and search path", () => {
    expect(correctionSql).toContain("id=auth.uid() AND status='active'");
    expect(correctionSql).toContain("current_user_has_permission('rental.manage') OR current_user_has_permission('rental.release')");
    expect(correctionSql).toContain("FROM rentals WHERE id=target_rental_id AND company_id=tenant");
    expect(correctionSql).toContain("'RELEASE_NOT_READY'");
    expect(correctionSql).toContain("SECURITY DEFINER SET search_path=erp,auth");
    expect(correctionSql).toContain("ALTER FUNCTION rental_release_readiness(text) OWNER TO postgres");
    expect(correctionSql).toContain("FROM PUBLIC, anon");
    expect(correctionSql).toContain("TO authenticated");
  });

  it("rejects missing, inactive, deleted, and cross-company projects through the same project result", () => {
    expect(correctionSql).toContain("CASE WHEN p.id IS NULL OR NOT p.active THEN 'project' END");
    expect(correctionSql).toContain("p.id=target.project_id AND p.company_id=tenant AND p.deleted_at IS NULL");
  });
});
