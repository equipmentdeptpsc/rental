import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261009000100_historical_submitted_deur_review_recovery.sql", "utf8");
const body = sql.slice(sql.indexOf("CREATE FUNCTION erp.command_recover_submitted_deur_customer_review"));

describe("historical Submitted DEUR customer-review recovery migration", () => {
  it("offers a separate command for a historical Submitted DEUR", () => {
    expect(body).toContain("target.status<>'Submitted'");
    expect(body).toContain("target.work_date >= (now_at AT TIME ZONE rental.timezone)::date");
    expect(body).toContain("'NORMAL_DATE_WINDOW'");
    expect(body).toContain("target.previous_revision_id IS NOT NULL");
  });

  it("does not modify the normal current-day generator", () => {
    expect(sql).not.toMatch(/(?:CREATE|ALTER)\s+(?:OR REPLACE\s+)?FUNCTION\s+erp\.command_generate_customer_review_batch/i);
    expect(sql).not.toContain("pg_get_functiondef");
  });

  it("rejects an acknowledged DEUR", () => expect(body).toContain("target.acknowledged_at IS NOT NULL"));
  it("rejects a non-Submitted DEUR", () => expect(body).toContain("target.status<>'Submitted'"));

  it("keeps another company's DEUR hidden", () => {
    expect(body).toContain("tenant text:=erp.current_company_id()");
    expect(body).toContain("WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE");
    expect(body).toContain("'NOT_FOUND'");
  });

  it("requires the existing administrative customer-review issuance permission", () => {
    expect(body).toContain("erp.current_user_has_permission('deur.customerReview.issue')");
    expect(body).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(body).toContain("TO authenticated");
  });

  it("derives and validates the recipient from the Rental snapshot", () => {
    expect(body).toContain("rental.customer_review_name_snapshot");
    expect(body).toContain("rental.customer_review_email_snapshot");
    expect(body).toContain("'RECIPIENT_UNAVAILABLE'");
    expect(body).toContain("key NOT IN('commandId','idempotencyKey','deurId')");
  });

  it("creates one grouped review request", () => {
    expect(body.match(/INSERT INTO erp\.customer_review_requests\(/g)).toHaveLength(1);
    expect(body).toContain("request_snapshot,'GROUPED') RETURNING * INTO request");
  });

  it("creates one batch item", () => {
    expect(body.match(/INSERT INTO erp\.customer_review_batch_items\(/g)).toHaveLength(1);
    expect(body).toContain("target.id,target.id,request.id,item_snapshot");
  });

  it("creates one original-date batch and finalizes it", () => {
    expect(body.match(/INSERT INTO erp\.customer_review_batches\(/g)).toHaveLength(1);
    expect(body).toContain("rental.id,target.work_date,rental.timezone");
    expect(body).toContain("SET summary_snapshot=summary_payload,finalized_at=now_at");
  });

  it("creates one pending grouped outbox intent", () => {
    expect(body.match(/INSERT INTO erp\.notification_outbox\(/g)).toHaveLength(1);
    expect(body).toContain("'CUSTOMER_GROUPED_REVIEW_REQUESTED'");
    expect(body).toContain("notification_payload,true) RETURNING * INTO intent");
  });

  it("replays the same command before checking existing review state", () => {
    expect(body.indexOf("idem->>'state'='REPLAY'")).toBeLessThan(body.indexOf("'REVIEW_REQUEST_PRESENT'"));
    expect(body).toContain("erp.finish_operational_command(command,'RECOVER_SUBMITTED_DEUR_CUSTOMER_REVIEW'");
  });

  it("does not duplicate an existing request", () => {
    expect(body).toContain("existing.deur_id=target.id OR existing.revision_id=target.id");
    expect(body).toContain("'ALREADY_EXISTS'");
  });

  it("does not duplicate a batch item or original-date batch", () => {
    expect(body).toContain("existing.deur_id=target.id OR existing.revision_id=target.id");
    expect(body).toContain("existing.rental_id=rental.id AND existing.review_date=target.work_date");
    expect(body).toContain("'RECOVERY_INTEGRITY'");
  });

  it("does not duplicate an existing logical outbox notification", () => {
    expect(body).toContain("existing.idempotency_key='customer-grouped-review:'||target.id||':submit-v1'");
    expect(body).toContain("identity:='customer-grouped-review:'||target.id||':submit-v1'");
  });

  it("leaves normal review date restrictions unchanged", () => {
    expect(sql).not.toContain("scheduler_preparation");
    expect(sql).not.toContain("historical_corrected_allowed");
  });

  it("does not send email or change the DEUR synchronously", () => {
    expect(body).not.toMatch(/(?:provider\.send|sendgrid|resend|dispatchExistingNotification|UPDATE erp\.deurs)/i);
    expect(body).toContain("requires_review_credential");
  });
});
