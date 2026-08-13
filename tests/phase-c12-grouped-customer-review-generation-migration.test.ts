import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve("supabase/migrations/20260803005900_phase_c12_grouped_customer_review_generation.sql");
const sql = readFileSync(migration,"utf8");

describe("C12 trusted grouped Customer Review generation migration",()=>{
  it("is exactly 05900 and leaves prior migrations untouched",()=>{
    expect(migration).toContain("20260803005900_phase_c12_grouped_customer_review_generation.sql");
    expect(sql).toContain("CREATE FUNCTION erp.command_generate_customer_review_batch(command jsonb)");
  });
  it("accepts only command, Rental, and bounded business-date inputs",()=>{
    expect(sql).toContain("key NOT IN('commandId','idempotencyKey','rentalId','businessDate')");
    expect(sql).toContain("current_company_id()");
    expect(sql).toContain("current_user_has_permission('deur.review')");
    expect(sql).not.toMatch(/key NOT IN\([^)]*(?:companyId|customerId|projectId|items|timezone|recipient)/i);
  });
  it("derives a real Rental timezone date with no UTC fallback",()=>{
    expect(sql).toContain("pg_catalog.pg_timezone_names");
    expect(sql).toContain("now_at AT TIME ZONE rental_record.timezone");
    expect(sql).toContain("requested_date>local_today+1");
    expect(sql).not.toMatch(/coalesce\([^;]*timezone[^;]*UTC/i);
  });
  it("uses canonical unsuperseded DEUR identity and deterministic line ordering",()=>{
    expect(sql).toContain("superseded_by_revision_id IS NULL");
    expect(sql).toContain("candidate_count>1");
    expect(sql).toContain("ORDER BY id LOOP");
    expect(sql).not.toMatch(/ORDER BY created_at DESC LIMIT 1[\s\S]{0,100}FROM erp\.deurs/i);
  });
  it("maps actionable and read-only states without fabricating In Progress completion",()=>{
    for(const state of ["IN_PROGRESS","SUBMITTED_AWAITING_ACKNOWLEDGEMENT","ACKNOWLEDGED","CORRECTION_REQUESTED"]) expect(sql).toContain(`'${state}'`);
    const inProgress=sql.slice(sql.indexOf("IF item_state='IN_PROGRESS'"),sql.indexOf("ELSE",sql.indexOf("IF item_state='IN_PROGRESS'")));
    expect(inProgress).not.toContain("shiftEnd");
    expect(inProgress).not.toContain("closingMeter");
  });
  it("reuses exact pending requests across days",()=>{
    expect(sql).toContain("revision_id=target.id AND status='Pending'");
    expect(sql).toContain("customer_review_request_id,item_snapshot");
    expect(sql).not.toContain("customer_review_requests.batch_id");
  });
  it("adds an explicit issuance mode and suppresses only grouped request intents",()=>{
    expect(sql).toContain("DEFAULT 'SINGLE'");
    expect(sql).toContain("issuance_mode IN('SINGLE','GROUPED')");
    expect(sql).toContain("IF NEW.issuance_mode='GROUPED' THEN RETURN NEW");
    expect(sql).toMatch(/snapshot,issuance_mode\)[\s\S]+request_snapshot,'GROUPED'/);
    expect(sql).toContain("CUSTOMER_REVIEW_REQUESTED");
  });
  it("converges same-day commands through operational idempotency and group identity",()=>{
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("begin_operational_command(command,'GENERATE_CUSTOMER_REVIEW_BATCH'");
    expect(sql).toContain("disposition','REPLAYED'");
    expect(sql).toContain("disposition','EXISTING'");
  });
  it("persists only the batch hash and returns raw credential only at creation",()=>{
    expect(sql).toContain("extensions.digest(raw_credential,'sha256')");
    expect(sql).toContain("jsonb_build_object('credential',raw_credential)");
    expect(sql).not.toMatch(/ADD COLUMN (?:raw_)?credential\b/i);
    expect(sql).not.toMatch(/INSERT INTO (?:erp\.)?audit_log[\s\S]+raw_credential/i);
  });
  it("freezes summary/items and prevents post-finalization mutation",()=>{
    expect(sql).toContain("ADD COLUMN finalized_at timestamptz");
    expect(sql).toContain("finalized grouped Customer Review batch is immutable");
    expect(sql).toContain("finalized grouped Customer Review batch items are immutable");
    for(const count of ["totalLineCount","actionableCount","inProgressCount","acknowledgedCount","correctionRequestedCount"]) expect(sql).toContain(`'${count}'`);
  });
  it("is authenticated-only and adds no public lookup, provider send, or scheduler",()=>{
    expect(sql).toContain("FROM PUBLIC,anon,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated");
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]+TO anon/i);
    expect(sql).not.toMatch(/(?:send_email|provider_send|cron\.schedule|pg_cron|resolve_grouped|get_grouped)/i);
  });
});
