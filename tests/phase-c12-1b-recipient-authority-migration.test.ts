import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260803004400_phase_c12_review_recipient_and_billing_evidence.sql","utf8");
const customer=sql.slice(sql.lastIndexOf("CREATE OR REPLACE FUNCTION command_create_customer_review_request"),sql.indexOf("ALTER FUNCTION erp.command_create_customer_review_request"));
const manager=sql.slice(sql.lastIndexOf("CREATE OR REPLACE FUNCTION command_create_manager_review_request"),sql.indexOf("ALTER FUNCTION erp.command_create_manager_review_request"));

describe("C12.1B trusted recipient authority",()=>{
  it("derives the customer recipient only from the rental snapshot before idempotency",()=>{
    expect(customer).toContain("rental.customer_review_name_snapshot");
    expect(customer).toContain("rental.customer_review_email_snapshot");
    expect(customer).not.toMatch(/customer\.email|customer\.name/);
    expect(customer.indexOf("canonical_recipient_destination=")).toBeLessThan(customer.indexOf("begin_operational_command(protected_command"));
    expect(customer).toContain("'_canonicalRecipientDestination',canonical_recipient_destination");
    expect(customer).toContain("rental.customer_review_email_snapshot ~ E'[\\\\r\\\\n]'");
  });

  it("rejects caller recipient authority and resolves one canonical active same-tenant approver",()=>{
    const acceptedKeys=manager.slice(manager.indexOf("WHERE key NOT IN"),manager.indexOf("THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED')"));
    expect(acceptedKeys).not.toContain("'recipientUserId'");
    expect(manager).not.toContain("recipient.username");
    expect(manager).toContain("resolve_manager_review_recipient(tenant)");
    expect(manager).toContain("company_id=tenant AND status='active'");
    expect(manager.indexOf("resolve_manager_review_recipient(tenant)")).toBeLessThan(manager.indexOf("begin_operational_command(protected_command"));
    expect(manager).toContain("'_canonicalRecipientUserId',resolved.user_id");
    expect(manager).toContain("'_canonicalRecipientDestination',lower(btrim(resolved.destination))");
  });

  it("keeps command functions security-defined with explicit paths and narrow grants",()=>{
    for(const body of [customer,manager]){
      expect(body).toContain("SECURITY DEFINER SET search_path=erp,auth,pg_catalog");
      expect(body).toContain("current_company_id()");
      expect(body).toMatch(/current_user_has_permission\('(deur\.review|rental\.approve)'\)/);
    }
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_create_customer_review_request(jsonb) FROM PUBLIC, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_create_manager_review_request(jsonb) FROM PUBLIC, anon");
  });
});
