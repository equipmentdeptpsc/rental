import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseCanonicalRentalRepository } from "@/integrations/supabase/SupabaseCanonicalRentalRepository";

const migration=readFileSync("supabase/migrations/20260826000100_canonical_rental_customer_review_configuration.sql","utf8");

describe("canonical Rental Customer Review configuration",()=>{
  it("repairs future PER_WORKDAY Reserve timezone projection from frozen policy evidence",()=>{
    expect(migration).toContain("{deurExpectationSnapshot,policy,timezone}");
    expect(migration).toContain("{deurExpectationSnapshot,shiftWindows,0,timezone}");
    expect(migration).toContain("coalesce(nullif(l.operational_metadata");
  });

  it("uses an action-specific authenticated tenant-derived command",()=>{
    for(const marker of["command_configure_rental_customer_review","current_company_id()","auth.uid()","rental.customerContact.update","company_id=tenant","GRANT EXECUTE ON FUNCTION erp.command_configure_rental_customer_review(jsonb) TO authenticated"])
      expect(migration).toContain(marker);
    expect(migration).not.toContain("rental.manage");
    expect(migration).not.toMatch(/command->>'companyId'/);
  });

  it("guards customer scope, lifecycle, version, timezone, recipient, pending review, and replay",()=>{
    for(const marker of["target.customer_id IS DISTINCT FROM command->>'customerId'","expected<>target.row_version","target.status NOT IN('Reserved','Released','Active','Returned')","customer_review_requests","pg_timezone_names","representative_name ~ '[\\r\\n]'","representative_email !~","IDEMPOTENCY_MISMATCH","disposition','REPLAYED'"])
      expect(migration).toContain(marker);
  });

  it("mutates only Rental review configuration and creates no review or billing artifact",()=>{
    expect(migration).toMatch(/UPDATE erp\.rentals SET timezone=canonical_timezone,customer_review_name_snapshot=representative_name/);
    expect(migration).not.toMatch(/UPDATE erp\.(deurs|commercial_snapshots|rental_equipment_lines|rental_contracts)/);
    expect(migration).not.toMatch(/INSERT INTO erp\.(customer_review_requests|customer_review_batches|billing_statement_lines)/);
    expect(migration).toContain("RENTAL_CUSTOMER_REVIEW_CONFIGURED");
    expect(migration).toContain("recipientFingerprint");
  });

  it("maps the remote adapter to exactly one canonical RPC",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:{success:true,disposition:"ACCEPTED",value:{rentalId:"r-1",status:"Active",version:9}},error:null});
    const input={commandId:"c",idempotencyKey:"i",rentalId:"r-1",customerId:"customer-1",expectedVersion:8,representativeName:"Representative",representativeEmail:"representative@example.test"};
    await new SupabaseCanonicalRentalRepository({schema:()=>({rpc})} as never).configureCustomerReview(input);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("command_configure_rental_customer_review",{command:input});
  });
});
