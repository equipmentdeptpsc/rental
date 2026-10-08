import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PersistenceMode } from "@/app/composition";
import { canUseCanonicalRemoteRentalCommercialTermsMutation } from "@/features/rental/services/rentalRuntimeCapability";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261008000200_preapproval_rental_preparation_revisions.sql");
const repair = read("src/features/assignment/components/AssignmentActivityCodeRepair.tsx");
const remoteTerms = read("src/features/rental/remote/RemoteCommercialTermsPage.tsx");
const workflow = read("src/features/rental/workspace/components/RentalWorkspaceWorkflowPanel.tsx");
const assignmentForm = read("src/features/assignment/components/RemoteAssignmentForm.tsx");
const releaseGate = read("supabase/migrations/20260822000250_canonical_rental_front_half.sql");

describe("pre-approval Rental preparation revision gates", () => {
  it("allows remote Commercial Terms and DEUR revisions without the rollout flag", () => {
    expect(canUseCanonicalRemoteRentalCommercialTermsMutation({ persistenceMode: PersistenceMode.Remote, remoteRentalCommercialTermsEnabled: false } as never)).toBe(true);
    expect(remoteTerms).toContain('hasPermission("rental.commercialTerms.update")');
    expect(remoteTerms).toContain("const editable = canEdit && !approvedLocked");
  });

  it("limits Assignment repair to Activity Code and the existing manage permission", () => {
    expect(repair).toContain('hasPermission("assignment.manage")');
    expect(repair).toContain("amendActivityCode({");
    expect(repair).not.toContain("equipmentId:");
    expect(repair).not.toContain("operatorId:");
    expect(repair).not.toContain("projectId:");
    expect(repair).not.toContain("status:");
    expect(migration).toContain("current_user_has_permission('assignment.manage')");
    expect(migration).not.toContain("current_user_has_permission('assignment.update')");
  });

  it("maps authorized amendment acceptance and server-side permission rejection", async () => {
    const rpc = vi.fn(async () => ({ data: null as unknown, error: null as null }));
    const repository = new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) });
    const command = { commandId: "command", idempotencyKey: "idem", assignmentId: "assignment", expectedVersion: 2, activityCodeId: "activity" };
    rpc.mockResolvedValueOnce({ data: { success: false, code: "FORBIDDEN" }, error: null });
    await expect(repository.amendActivityCode(command)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
    expect(rpc).toHaveBeenCalledWith("command_amend_assignment_activity_code", { command });
    rpc.mockImplementationOnce(async () => ({ data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-10-08T00:00:00Z", refresh: ["assignment"], value: { id: "assignment", activityCodeId: "activity", rowVersion: 3 } }, error: null }));
    await expect(repository.amendActivityCode(command)).resolves.toMatchObject({ success: true, value: { id: "assignment", activityCodeId: "activity", rowVersion: 3 } });
  });

  it("requires Activity Code in the create UI and canonical RPC", () => {
    expect(assignmentForm).toContain('submission.fail("Activity Code is required for this assignment.")');
    expect(migration).toContain("nullif(btrim(command->>'activityCodeId'),'') IS NULL");
  });

  it("shows a clear DEUR repair path and returns to preparation after update", () => {
    expect(remoteTerms).toContain("Activity Code is missing from the linked assignment. Update the assignment before preparing the DEUR.");
    expect(remoteTerms).toContain("Edit Assignment");
    expect(repair).toContain("requestCanonicalRentalRefresh()");
    expect(repair).toContain('navigate(returnTo, { replace: true })');
  });

  it("keeps prior preparation steps navigable only before approval", () => {
    expect(workflow).toContain('aggregate.rental.approvalStatus !== "Approved"');
    expect(workflow).toContain("Commercial Terms");
    expect(workflow).toContain("DEUR Preparation");
    expect(workflow).toContain("linkedAssignments.map");
  });

  it("revises the existing Assignment and draft Commercial Terms without accumulating records", () => {
    expect(migration).toContain("UPDATE erp.assignments SET activity_code_id=activity.id");
    expect(migration).toContain("DELETE FROM erp.rental_contracts WHERE rental_id=target.id AND status='Draft'");
    expect(migration).toContain("INSERT INTO erp.rental_contracts");
    expect(migration).toContain("jsonb_build_object('draftPreparation'");
    expect(migration).toContain("IF (SELECT array_agg(value->>'lineId'");
  });

  it("blocks Assignment and Terms RPC revisions after approval while retaining reference guards", () => {
    expect(migration.match(/APPROVED_LOCKED/g)).toHaveLength(2);
    expect(migration).toContain("activity_code_id=item->>'activityCodeId'");
    expect(migration).toContain("current_user_has_permission('assignment.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN')");
    expect(remoteTerms).toContain("This rental has already been approved. Preparation details can no longer be changed.");
  });

  it("keeps Rental release behind the existing approval check", () => {
    expect(releaseGate).toContain("target.approval_status='Approved'");
    expect(releaseGate).toContain("command_release_rental");
    expect(migration).not.toContain("command_release_rental");
  });
});
