import{describe,expect,it}from"vitest";
import{readFileSync}from"node:fs";

describe("canonical grouped-review dispatch resolver",()=>{
 const sql=readFileSync("supabase/migrations/20260829000600_canonical_grouped_review_dispatch_resolution.sql","utf8");
 it("is service-role-only and read-only",()=>{
  expect(sql).toContain("STABLE SECURITY DEFINER");
  expect(sql).toContain("auth.role()<>'service_role'");
  expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
 });
 it("resolves through batch membership and exact batch notification",()=>{
  expect(sql).toContain("customer_review_batch_items");
  expect(sql).toContain("source_aggregate_type='CUSTOMER_REVIEW_BATCH'");
  expect(sql).toContain("source_aggregate_id=batch_id::text");
  expect(sql).toContain("NOTIFICATION_AMBIGUOUS");
 });
 it("projects delivery state and fail-closed eligibility",()=>{
  for(const field of ["deliveryAttemptCount","acknowledgementCount","activeEnvelopeCount","eligibleForDispatch","failClosedReason"])expect(sql).toContain(field);
  expect(sql).toContain("DELIVERY_ENVELOPE_NOT_EXACT");
  expect(sql).toContain("NOTIFICATION_NOT_PENDING");
 });
 it("declares deterministic fail-closed outcomes for the resolver matrix",()=>{
  for(const reason of ["BATCH_ITEM_NOT_FOUND","BATCH_ITEM_AMBIGUOUS","REVIEW_NOT_FOUND","REVIEW_AMBIGUOUS","REVIEW_CONSUMED","NOTIFICATION_NOT_FOUND","NOTIFICATION_AMBIGUOUS","NOTIFICATION_NOT_PENDING","NOTIFICATION_ALREADY_ATTEMPTED","DELIVERY_ATTEMPT_ALREADY_EXISTS","NOTIFICATION_ALREADY_ASSIGNED","NOTIFICATION_NOT_DUE","NOTIFICATION_LOCKED","DELIVERY_ENVELOPE_NOT_EXACT","ALREADY_ACKNOWLEDGED"])expect(sql).toContain(reason);
  expect(sql).toContain("eligibleForDispatch");
 });
 it("preserves grouped-batch semantics",()=>{
  expect(sql).toContain("batchId");
  expect(sql).toContain("CUSTOMER_REVIEW_BATCH");
  expect(sql).not.toContain("f0d28da4-96e1-44fd-b5db-b1cd9c461903");
 });
});
