import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260803005100_phase_c12_stranded_uat_number_sequence_cleanup.sql";
const sql = readFileSync(migrationPath, "utf8");
const manifest = [
  ["TENANT-UAT-C4B2-BILLING", "BILLING_STATEMENT", "2026", "BS", "30"],
  ["TENANT-UAT-C4C-DEUR", "DEUR", "2026", "DEUR", "13"],
  ["TENANT-UAT-C4D-RACES", "DEUR", "2026", "DEUR", "13"],
  ["TENANT-UAT-C4E-FINANCIAL", "BILLING_STATEMENT", "2026", "BS", "14"],
] as const;

describe("C12 exact stranded UAT number-sequence cleanup", () => {
  it("locks the explicitly governed clean-install-compatible release-history bytes", () => {
    expect(createHash("sha256").update(sql).digest("hex"))
      .toBe("c087c556291197b05a6553b00595be6034f0c39045d1fa9c61d5c10e972310b7");
  });

  it("uses migration 05100 and accepts only the exact certified four-row or clean zero-row state", () => {
    expect(migrationPath).toContain("20260803005100_");
    for (const row of manifest) for (const value of row) expect(sql).toContain(value);
    expect(sql).toContain("uat_sequence_count NOT IN (0, 4)");
    expect(sql).toContain("uat_sequence_count = 4 AND manifest_count <> 4");
    expect(sql).toContain("exact four-row manifest mismatch");
    expect(sql).toContain("sequence.current_value = manifest.current_value");
  });

  it("fails closed for 1, 2, 3, 5+, or advanced UAT sequence rows", () => {
    expect(sql).toContain("WHERE company_id LIKE 'TENANT-UAT-%'");
    expect(sql).toContain("uat_sequence_count NOT IN (0, 4)");
    expect(sql).toContain("uat_sequence_count = 4 AND manifest_count <> 4");
    expect(sql.match(/current_value/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("OR EXISTS (SELECT 1 FROM erp.number_sequences WHERE company_id LIKE 'TENANT-UAT-%')");
    expect(sql).toContain("deleted_count <> uat_sequence_count");
  });

  it("performs zero deletion for clean installs and remains repeat-safe", () => {
    expect(sql).toContain("deleted_count := 0");
    expect(sql).toContain("IF uat_sequence_count = 4 THEN\n    DELETE FROM erp.number_sequences");
    expect(sql).toContain("deleted_count <> uat_sequence_count");
  });

  it("requires parent and business evidence to remain absent", () => {
    expect(sql).toContain("IF uat_sequence_count = 4 AND EXISTS");
    for (const table of [
      "companies", "users", "user_roles", "operators", "customers", "projects", "equipment",
      "assignments", "rentals", "rental_equipment_lines", "deurs", "customer_review_requests",
      "customer_review_outcomes", "manager_review_requests", "manager_review_outcomes",
      "notification_outbox", "notification_delivery_attempts", "billing_statements",
      "billing_statement_lines", "collections", "operational_command_idempotency",
      "deur_command_idempotency", "audit_log",
    ]) expect(sql).toContain(`erp.${table}`);
    expect(sql).toContain("parent or business fixture evidence exists");
  });

  it("protects TENANT-LOCAL-001 before and after deletion", () => {
    expect(sql.match(/id = 'TENANT-LOCAL-001'/g)).toHaveLength(2);
    expect(sql.match(/code = 'LOCAL'/g)).toHaveLength(2);
    expect(sql.match(/environment_class = 'compatibility'/g)).toHaveLength(2);
  });

  it("deletes by exact tuple only and uses no enforcement bypass", () => {
    expect(sql).toContain("DELETE FROM erp.number_sequences sequence\n    USING (VALUES");
    expect(sql).not.toMatch(/DELETE FROM erp\.number_sequences[^;]*LIKE\s+'TENANT-UAT-%'/s);
    expect(sql).not.toMatch(/session_replication_role|DISABLE\s+(?:TRIGGER|ROW\s+LEVEL\s+SECURITY)|auth\.users/i);
    expect(sql).not.toMatch(/(?:DELETE|UPDATE|INSERT)\s+(?:FROM\s+|INTO\s+)?erp\.(?:app_roles|app_permissions|role_permissions)/i);
    expect(sql.match(/DELETE FROM erp\.number_sequences/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b[^;]*(?:auth\.users|erp\.(?:companies|users|rentals|deurs|billing_statements))/is);
  });

  it("does not touch unrelated tenant sequence rows", () => {
    expect(sql).toContain("sequence.company_id = manifest.company_id");
    expect(sql).not.toMatch(/DELETE FROM erp\.number_sequences[^;]*company_id\s+NOT\s+LIKE/is);
    expect(sql).not.toMatch(/TRUNCATE\s+(?:TABLE\s+)?erp\.number_sequences/i);
  });

  it("corrects all four historical harness cleanup paths", () => {
    const files = [
      "tests/phase-c4b2-billing-live.integration.test.ts",
      "tests/phase-c4c-deur-live.integration.test.ts",
      "tests/phase-c4d-parallel-concurrency-live.integration.test.ts",
      "tests/phase-c4e-financial-recovery-live.integration.test.ts",
    ];
    for (const file of files) {
      const harness = readFileSync(file, "utf8");
      expect(harness).not.toContain("session_replication_role");
      expect(harness).toContain("DELETE FROM erp.number_sequences WHERE company_id='${tenant}'");
      expect(harness.indexOf("DELETE FROM erp.number_sequences")).toBeLessThan(harness.indexOf("DELETE FROM erp.companies"));
    }
  });

  it("preserves applied migrations 04500 through 05000 byte-for-byte", () => {
    const expected: Record<string, string> = {
      "20260803004500_phase_c12_c4e_customer_review_outcome_residue_cleanup.sql": "50c8c325975abfaaa43ef7ba1132f6fefad1137ca3e6d14107bf74930cbe86a6",
      "20260803004600_phase_c12_manager_certification_cleanup.sql": "2753457ed84baf72e8ada355835336c9caf170d717070c2c613d69e4560dbc35",
      "20260803004700_phase_c12_customer_email_certification_cleanup.sql": "01fb34731efbd02b4a345c04fe1c2ffc0083c42de7ea1402af12fe75f19a7487",
      "20260803004800_phase_c12_customer_email_cleanup_dependency_order_correction.sql": "43b7fc272ca7a01f80ddba33a7b7190a83d5fd70016d2244dc355e4d2ac5cbd3",
      "20260803004900_phase_c12_customer_review_company_evidence.sql": "c7a955ca13ea48841ede304e6daf34186a747e50e80c5dd96f314ed4ede85540",
      "20260803005000_phase_c12_manager_real_email_cleanup.sql": "125345ff531e0ca820499c094ef7f181bad131891d04e5f3b71ade2321970d01",
    };
    for (const [file, digest] of Object.entries(expected)) {
      expect(createHash("sha256").update(readFileSync(`supabase/migrations/${file}`)).digest("hex")).toBe(digest);
    }
  });
});
