import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseRentalPreparationCommandRepository } from "../src/integrations/supabase/SupabaseRentalPreparationCommandRepository";

const sql=readFileSync("supabase/migrations/20260803008000_phase_p9_multi_line_rental_preparation.sql","utf8");

describe("P9.2D aggregate Rental preparation contract",()=>{
  it("adds an isolated authenticated aggregate RPC with exact-set, locking, readiness and audit controls",()=>{
    expect(sql).toContain("command_prepare_reserved_rental_aggregate(command jsonb)");
    expect(sql).toContain("supplied_ids IS DISTINCT FROM active_ids");
    expect(sql).toContain("ORDER BY id FOR UPDATE");
    expect(sql.match(/rental_release_readiness\(target\.id\)/g)).toHaveLength(1);
    expect(sql).toContain("'PREPARE_RESERVED_RENTAL_AGGREGATE'");
    expect(sql).toContain("'RENTAL_PREPARED'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_prepare_reserved_rental_aggregate(jsonb) FROM PUBLIC,anon,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_prepare_reserved_rental_aggregate(jsonb) TO authenticated");
  });

  it("keeps the certified single-line migration immutable",()=>{
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION erp.command_prepare_reserved_rental(command jsonb)");
  });

  it("validates authoritative aggregate projections and treats transport uncertainty safely",async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:{success:true,disposition:"ACCEPTED",serverOccurredAt:"2026-08-15T00:00:00Z",refresh:["R1","L1"],value:{rentalId:"R1",companyId:"C1",status:"Reserved",version:2,preparedLineCount:1,releaseReady:true,lines:[{lineId:"L1",assignmentId:"A1",equipmentId:"E1",operatorId:"O1",sourceFingerprint:"hash",version:3}]}},error:null}).mockResolvedValueOnce({data:null,error:{message:"timeout"}});
    const repository=new SupabaseRentalPreparationCommandRepository({schema:()=>({rpc})});
    const command={commandId:"C",idempotencyKey:"I",rentalId:"R1",expectedRentalVersion:1,lines:[]};
    expect(await repository.prepareReservedRentalAggregate(command)).toMatchObject({success:true,value:{preparedLineCount:1}});
    expect(await repository.prepareReservedRentalAggregate(command)).toMatchObject({success:false,code:"TRANSPORT_FAILURE",retryable:true,refreshRequired:true});
    expect(rpc).toHaveBeenCalledWith("command_prepare_reserved_rental_aggregate",{command});
  });
});
