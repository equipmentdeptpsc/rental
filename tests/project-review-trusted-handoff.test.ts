import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTrustedNotificationRepository } from "../server/notifications/SupabaseTrustedNotificationRepository";
import { decryptGroupedReviewDeliveryEnvelope } from "../server/notifications/GroupedReviewDeliveryEnvelope";

describe("trusted Project Customer Review handoff", () => {
  it("prepares every recipient of a pending Project batch with one shared path before claiming", async () => {
    const key = Buffer.alloc(32, 7);
    let prepared: Record<string, any> | undefined;
    const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "read_pending_project_review_batch_handoffs") return {
        data: { success: true, value: [{ batchId: "batch-1", notificationIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] }] }, error: null,
      };
      if (name === "prepare_project_review_batch_handoff") { prepared = args.command; return { data: { success: true, disposition: "PREPARED" }, error: null }; }
      if (name === "claim_notification_delivery_batch") return { data: { success: true, value: [] }, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const client = { schema: () => ({ rpc }) } as unknown as SupabaseClient;
    const repository = new SupabaseTrustedNotificationRepository(client, client, key);
    expect(await repository.claimBatch("33333333-3333-4333-8333-333333333333", 10)).toEqual([]);
    expect(prepared?.credentialHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared?.envelopes).toHaveLength(2);
    const paths = prepared!.envelopes.map((envelope: Record<string, any>) =>
      decryptGroupedReviewDeliveryEnvelope(envelope as any, envelope.notificationId, key));
    expect(paths[0]).toMatch(/^\/review\/customer\/grouped\/[0-9a-f]{64}$/);
    expect(paths[1]).toBe(paths[0]);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "read_pending_project_review_batch_handoffs", "prepare_project_review_batch_handoff", "claim_notification_delivery_batch",
    ]);
  });
});
