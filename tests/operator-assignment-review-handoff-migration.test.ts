import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SupabaseTrustedNotificationRepository } from "../server/notifications/SupabaseTrustedNotificationRepository";

const path = "supabase/migrations/20261008000500_operator_assignment_visibility_and_deur_review_handoff.sql";
const sql = readFileSync(path, "utf8");

describe("operator Assignment visibility and DEUR review handoff migration", () => {
  it("projects only the authenticated Operator own active Assignment without broad RLS changes", () => {
    expect(sql).toContain("erp.current_active_operator_id()");
    expect(sql).toContain("a.operator_id=i.operator_id AND a.status='Active'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.read_current_operator_assignments() TO authenticated");
    expect(sql).not.toMatch(/CREATE POLICY|ALTER TABLE[^;]+DISABLE ROW LEVEL SECURITY/);
  });

  it("keeps visibility separate from the Active-only server command gate", () => {
    expect(sql).toContain("coalesce(r.rental_number,'Preparation pending')");
    expect(sql).toContain("coalesce(r.status::text,'Preparation pending')");
    expect(sql).toContain("coalesce(line.status::text,'Preparation pending')");
    expect(sql).toContain("'deurEligible',coalesce(r.status='Active' AND line.status='Active',false)");
    expect(sql).toContain("line.status<>''Active''");
    expect(sql).toContain("active_rental.status=''Active''");
    expect(sql).toContain("'RENTAL_NOT_ACTIVE'");
  });

  it("creates one idempotent grouped review outbox handoff from authoritative snapshots", () => {
    expect(sql).toContain("erp.command_generate_customer_review_batch");
    expect(sql).toContain("erp.current_user_has_permission(''deur.customerReview.issue'') OR erp.current_user_has_permission(''deur.review'')");
    expect(sql).toContain("rental.customer_review_email_snapshot");
    expect(sql).toContain("ON CONFLICT(company_id,idempotency_key)");
    expect(sql).toContain("PERFORM erp.enqueue_submitted_deur_customer_review(current_deur.id)");
    expect(sql).toContain("requires_review_credential");
    expect(sql).toContain("erp.notification_delivery_envelopes");
    expect(sql).toContain("n.idempotency_key LIKE 'customer-grouped-review:%:submit-v1'");
    expect(sql).not.toMatch(/resend|sendgrid|provider\.send/i);
  });

  it("prepares the encrypted handoff before the existing worker claim", async () => {
    const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
    const notificationId = "00000000-0000-4000-8000-000000000001";
    const batchId = "00000000-0000-4000-8000-000000000002";
    const service = { schema: () => ({ rpc: vi.fn(async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ name, parameters });
      if (name === "read_pending_submitted_deur_review_handoffs") return { data: { success: true, value: [{ notificationId, batchId }] }, error: null };
      if (name === "prepare_submitted_deur_review_handoff") return { data: { success: true, disposition: "PREPARED" }, error: null };
      if (name === "claim_notification_delivery_batch") return { data: { success: true, value: [] }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    }) }) };
    const repository = new SupabaseTrustedNotificationRepository({} as never, service as never, Buffer.alloc(32, 7));
    await expect(repository.claimBatch("worker-1", 5)).resolves.toEqual([]);
    expect(calls.map(call => call.name)).toEqual([
      "read_pending_submitted_deur_review_handoffs",
      "prepare_submitted_deur_review_handoff",
      "claim_notification_delivery_batch",
    ]);
    expect(calls[1].parameters.command).toMatchObject({ notificationId, batchId, envelopeType: "GROUPED_CUSTOMER_REVIEW_PATH" });
  });
});
