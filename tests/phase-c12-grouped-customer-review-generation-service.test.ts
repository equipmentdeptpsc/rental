import {describe,expect,it,vi} from "vitest";
import {CustomerReviewBatchGenerationService} from "../src/features/rental/customer-review/CustomerReviewBatchGenerationService";
import type {CustomerReviewBatchGenerationRepository,GenerateCustomerReviewBatchInput} from "../src/features/rental/customer-review/groupedReviewContracts";
import {SupabaseCustomerReviewBatchGenerationRepository} from "../src/integrations/supabase/SupabaseCustomerReviewBatchGenerationRepository";

const input:GenerateCustomerReviewBatchInput={commandId:"command-1",idempotencyKey:"key-1",rentalId:"rental-1",businessDate:"2026-08-11"};
describe("grouped Customer Review generation service",()=>{
 it("delegates only provider-neutral canonical command inputs",async()=>{const generate=vi.fn().mockResolvedValue({success:true,disposition:"EXISTING",value:{batchId:"b",reviewDate:"2026-08-11",expiresAt:"later"}});const repository:CustomerReviewBatchGenerationRepository={generate};await new CustomerReviewBatchGenerationService(repository).generate(input);expect(generate).toHaveBeenCalledWith(input);expect(Object.keys(input)).toEqual(["commandId","idempotencyKey","rentalId","businessDate"]);});
 it("maps the trusted RPC result",async()=>{const rpc=vi.fn().mockResolvedValue({data:{success:true,disposition:"CREATED",value:{batchId:"b",reviewDate:"2026-08-11",expiresAt:"later",credential:"a".repeat(64)}},error:null});const client={schema:vi.fn(()=>({rpc}))};const result=await new SupabaseCustomerReviewBatchGenerationRepository(client).generate(input);expect(client.schema).toHaveBeenCalledWith("erp");expect(rpc).toHaveBeenCalledWith("command_generate_customer_review_batch",{command:input});expect(result.success).toBe(true);});
 it("fails closed on transport or unknown responses",async()=>{const client={schema:()=>({rpc:vi.fn().mockResolvedValue({data:null,error:{}})})};await expect(new SupabaseCustomerReviewBatchGenerationRepository(client).generate(input)).resolves.toEqual({success:false,code:"TRANSPORT_FAILURE"});});
});
