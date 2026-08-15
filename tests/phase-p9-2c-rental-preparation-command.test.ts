import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { SupabaseRentalPreparationCommandRepository } from "@/integrations/supabase/SupabaseRentalPreparationCommandRepository";

describe("P9.2C Rental preparation authority", () => {
  it("defines a tenant-derived authenticated server preparation boundary", () => {
    const sql=fs.readFileSync("supabase/migrations/20260803007900_phase_p9_remote_rental_preparation.sql","utf8");
    expect(sql).toContain("command_prepare_reserved_rental(command jsonb)");
    expect(sql).toContain("company_id FROM erp.users WHERE id=auth.uid() AND status='active'");
    expect(sql).toContain("current_user_has_permission('rental.manage')");
    expect(sql).toContain("current_deur_expectation_fingerprint(id)");
    expect(sql).toContain("readiness=erp.rental_release_readiness(target.id)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_prepare_reserved_rental(jsonb) FROM PUBLIC,anon,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_prepare_reserved_rental(jsonb) TO authenticated");
    expect(sql).toContain("p9_authenticated_tenant_read_commercial_snapshots");
    expect(sql).toContain("GRANT SELECT ON erp.commercial_snapshots TO authenticated");
    expect(sql).toContain("r.company_id=(SELECT u.company_id FROM erp.users u WHERE u.id=auth.uid() AND u.status='active')");
    expect(sql).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(sql).not.toContain("DISABLE TRIGGER");
  });

  it("maps valid projections and uncertain transport safely", async () => {
    const projection={ success:true, disposition:"ACCEPTED", serverOccurredAt:"2026-08-15T00:00:00Z", refresh:["r"], value:{rentalId:"r",lineId:"l",status:"Reserved",version:2,releaseReady:true} };
    const rpc=vi.fn().mockResolvedValue({data:projection,error:null});
    const repository=new SupabaseRentalPreparationCommandRepository({schema:()=>({rpc})});
    const command={commandId:"c",idempotencyKey:"i",expectedVersion:1,rentalId:"r",lineId:"l",commercialTerms:{billingMethod:"Per Hour" as const,unitRate:100,operatorIncluded:true,currency:"PHP"},costCodeId:"cc",activityCodeId:"ac",workDescriptionId:"w",deurPolicy:{frequency:"ON_DEMAND" as const,effectiveFrom:"2026-08-15"},shiftWindows:[],workDate:"2026-08-15",meterRequirement:"none" as const};
    await expect(repository.prepareReservedRental(command)).resolves.toEqual(projection);
    rpc.mockResolvedValueOnce({data:null,error:{message:"network"}});
    await expect(repository.prepareReservedRental(command)).resolves.toMatchObject({success:false,code:"TRANSPORT_FAILURE",retryable:true,refreshRequired:true});
  });
});
