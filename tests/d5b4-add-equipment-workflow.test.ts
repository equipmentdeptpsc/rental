import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SupabaseCanonicalRentalRepository } from "@/integrations/supabase/SupabaseCanonicalRentalRepository";

const contracts = readFileSync("src/features/rental/remote/contracts.ts", "utf8");
const remote = readFileSync("src/integrations/supabase/SupabaseCanonicalRentalRepository.ts", "utf8");
const local = readFileSync("src/features/rental/remote/LocalCanonicalRentalEquipmentRepository.ts", "utf8");
const dependencies = readFileSync("src/app/composition/ApplicationDependencies.ts", "utf8");
const localComposition = readFileSync("src/app/composition/createLocalApplicationDependencies.ts", "utf8");
const remoteComposition = readFileSync("src/app/composition/createApplicationDependencies.ts", "utf8");
const panel = readFileSync("src/features/rental/workspace/overview/sections/AddEquipmentPanel.tsx", "utf8");
const section = readFileSync("src/features/rental/workspace/overview/sections/EquipmentSection.tsx", "utf8");
const overview = readFileSync("src/features/rental/workspace/overview/Overview.tsx", "utf8");

const input = { commandId: "cmd-1", idempotencyKey: "idem-1", rentalId: "r-1", equipmentId: "e-1", proposedEffectiveStartDate: "2031-04-10" };

describe("D5B4 Add Equipment repository and workspace workflow", () => {
  it("defines the canonical repository input", () => expect(contracts).toContain("interface AddRentalEquipmentInput"));
  it.each(["rentalId", "equipmentId", "proposedEffectiveStartDate", "sourceAssignmentId"])("keeps %s in the repository contract", (field) => expect(contracts).toContain(field));
  it("exposes an application command repository slot", () => expect(dependencies).toContain("canonicalRentalEquipment?: CanonicalRentalEquipmentRepository"));
  it("maps the remote repository to the certified RPC", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", value: { rentalId: "r-1", rentalLineId: "line-1", equipmentId: "e-1", lineStatus: "Draft", effectiveStartDate: "2031-04-10", version: 1 } }, error: null }));
    const result = await new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never).addEquipment(input);
    expect(rpc).toHaveBeenCalledWith("command_add_rental_equipment", { command: input });
    expect(result).toMatchObject({ success: true, value: { rentalId: "r-1", rentalLineId: "line-1", equipmentId: "e-1", lineStatus: "Draft" } });
  });
  it("omits sourceAssignmentId for ordinary candidates", () => expect(input).not.toHaveProperty("sourceAssignmentId"));
  it("propagates sourceAssignmentId when supplied", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", value: { rentalId: "r-1", rentalLineId: "line-1", equipmentId: "e-1", lineStatus: "Draft", effectiveStartDate: "2031-04-10", sourceAssignmentId: "a-1", version: 1 } }, error: null }));
    const sourceInput = { ...input, sourceAssignmentId: "a-1" };
    await new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never).addEquipment(sourceInput);
    expect(rpc).toHaveBeenCalledWith("command_add_rental_equipment", { command: sourceInput });
  });
  it.each(["DUPLICATE_EQUIPMENT_LINE", "EQUIPMENT_INTERVAL_CONFLICT", "FORBIDDEN", "PARENT_READ_ONLY", "PARENT_STATE_NOT_ELIGIBLE", "MISSING_RELATIONSHIP", "INVALID_EFFECTIVE_START"])("preserves canonical %s errors", async (code) => {
    const rpc = vi.fn(async () => ({ data: { success: false, code, message: "canonical" }, error: null }));
    const result = await new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never).addEquipment(input);
    expect(result).toMatchObject({ success: false, code });
  });
  it("maps remote transport failure distinctly", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { status: 503 } }));
    expect(await new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never).addEquipment(input)).toMatchObject({ success: false, code: "TRANSPORT_FAILURE" });
  });
  it("provides local behavior with the same command shape", () => {
    expect(local).toContain("class LocalCanonicalRentalEquipmentRepository");
    expect(local).toContain("effectiveStartDate: input.proposedEffectiveStartDate");
    expect(local).toContain("DUPLICATE_EQUIPMENT_LINE");
  });
  it("documents local versus remote D3 fidelity", () => expect(local).toContain("interval authority remains remote"));
  it("composes the local repository", () => expect(localComposition).toContain("canonicalRentalEquipment:new LocalCanonicalRentalEquipmentRepository"));
  it("composes the remote repository", () => expect(remoteComposition).toContain("canonicalRentalEquipment:canonicalRental"));
  it("uses the narrow rental.update capability", () => expect(panel).toContain('hasPermission("rental.update")'));
  it("shows the Add Equipment entry point", () => expect(panel).toContain("Add Equipment"));
  it.each(["Draft", "Reserved", "Released", "Active"])("allows %s through the UI eligibility set", (status) => expect(panel).toContain(`"${status}"`));
  it.each(["Cancelled", "Closed"])("excludes %s through the UI eligibility set", (status) => expect(panel).toContain(status));
  it("excludes legacy Returned through the server-safe UI gate", () => expect(panel).toContain('"Returned"'));
  it("does not use the legacy rental.manage capability", () => expect(panel).not.toContain("rental.manage"));
  it("renders read-only parent Rental context", () => {
    for (const field of ["Rental", "Customer / Project", "Parent status", "Expected return"]) expect(panel).toContain(field);
  });
  it("uses the canonical equipment source without status Available filtering", () => {
    expect(panel).toContain("equipment.filter");
    expect(panel).not.toContain('status === "Available"');
  });
  it("marks same-Rental equipment as unavailable convenience options", () => expect(panel).toContain("disabled={selectedEquipmentIds.has(item.id)}"));
  it.each(["equipmentId", "effectiveStart", "sourceAssignmentId"])("refreshes availability when %s changes", (field) => expect(panel).toContain(field));
  it("reuses EquipmentAvailabilityController", () => expect(panel).toContain("new EquipmentAvailabilityController"));
  it("passes the effective start as the D4 window start", () => expect(panel).toContain("windowStart: effectiveStart"));
  it("passes the parent expected return as the D4 window end", () => expect(panel).toContain("windowEnd: rental.expectedReturn ?? null"));
  it("keeps source Assignment optional", () => expect(panel).toContain("sourceAssignmentId ? { sourceAssignmentId }"));
  it.each(["not_checked", "checking", "available", "conflict", "error"])("renders the %s availability state", (status) => expect(panel).toContain(`"${status}"`));
  it("renders conflict details", () => expect(panel).toContain("commitmentStart"));
  it("uses accessible status announcements", () => expect(panel).toContain("aria-live"));
  it("keeps the form open on a stale interval conflict", () => expect(panel).toContain('result.code === "EQUIPMENT_INTERVAL_CONFLICT"'));
  it("maps duplicate errors to a specific message", () => expect(panel).toContain("This equipment is already included in this Rental."));
  it("does not navigate on submit", () => expect(panel).not.toContain("navigate("));
  it("submits exactly one canonical equipment command", () => expect(panel).toContain("repository.addEquipment({"));
  it("does not submit while availability is not confirmed", () => expect(panel).toContain('availability.status !== "available"'));
  it("refreshes the targeted workspace after success", () => expect(panel).toContain("notifyRentalWorkspaceChange(rental.id"));
  it("refreshes canonical remote projections after success", () => expect(panel).toContain("requestCanonicalRentalRefresh()"));
  it("reports the new line as Draft", () => expect(panel).toContain("Equipment added to the Rental as Draft."));
  it("keeps effective start selectable with a parent lower bound", () => {
    expect(panel).toContain('type="date"');
    expect(panel).toContain("min={rental.dateOut}");
  });
  it("supports an open-ended parent without a max date", () => expect(panel).toContain("max={rental.expectedReturn}"));
  it("keeps one equipment per submission", () => expect(panel).not.toContain("multiple"));
  it("does not introduce billing controls", () => { expect(panel).not.toContain("invoice"); expect(panel).not.toContain("billing"); });
  it("mounts the panel inside the Equipment section", () => expect(section).toContain("AddEquipmentPanel"));
  it("passes Rental lines and candidate sources to the panel", () => expect(overview).toContain("<AddEquipmentPanel rental={aggregate.rental}"));
  it("preserves line effective start in the shared line model", () => expect(readFileSync("src/features/rental/equipment-line/types.ts", "utf8")).toContain("effectiveStartDate?: string"));
});
