import { describe, expect, it } from "vitest";
import { FakeEmailDeliveryProvider } from "../server/notifications/FakeEmailDeliveryProvider";
import { TrustedNotificationWorker, type ClaimedNotification, type GroupedReviewDeliveryResolution, type TrustedNotificationWorkerRepository } from "../server/notifications/TrustedNotificationWorker";
import type { DeliveryStatus } from "@/features/notifications/domain";

const notification: ClaimedNotification={id:"10000000-0000-4000-8000-000000000064",companyId:"TENANT-UAT-C12-GROUPED-CUSTOMER-001",type:"CUSTOMER_GROUPED_REVIEW_REQUESTED",recipient:{destination:"customer@example.invalid",displayName:"Customer"},sourceAggregateType:"CUSTOMER_REVIEW_BATCH",sourceAggregateId:"20000000-0000-4000-8000-000000000064",templateVersion:3,idempotencyKey:"customer-grouped-review:stable:v1",requiresReviewCredential:true,attempt:0,input:{recipientName:"Customer",companyName:"Company",customerName:"Customer",projectName:"Project",rentalReference:"R-1",totalLineCount:3,actionableCount:2,inProgressCount:1}};

class RetryRepository implements TrustedNotificationWorkerRepository {
  attempts=0; status:DeliveryStatus="Pending"; envelopeActive=true; resolution:GroupedReviewDeliveryResolution={status:"ACTIVE",reviewPath:"/review/customer/grouped/"+"a".repeat(64)};
  async claimBatch():Promise<ClaimedNotification[]>{if(!["Pending","Failed"].includes(this.status))return[];this.status="Processing";this.attempts++;return[{...notification,attempt:this.attempts}];}
  async resolveGroupedReviewDelivery(){return this.envelopeActive?this.resolution:{status:"MISSING" as const};}
  async complete(input:{status:DeliveryStatus}){this.status=input.status;if(["ProviderAccepted","Cancelled","Superseded","FailedCredentialLost","DeadLetter"].includes(input.status))this.envelopeActive=false;}
}

describe("C12 grouped review retry worker",()=>{
  it("retains the envelope after a transient result and accepts the same intent with stable provider idempotency after recreation",async()=>{
    const repository=new RetryRepository();const firstProvider=new FakeEmailDeliveryProvider("temporary-failure");
    expect(await new TrustedNotificationWorker(repository,firstProvider,"sender@example.invalid",10,"https://app.example.test").runOnce()).toEqual({claimed:1,providerCalls:1});
    expect(repository).toMatchObject({attempts:1,status:"Failed",envelopeActive:true});
    const secondProvider=new FakeEmailDeliveryProvider("success");
    expect(await new TrustedNotificationWorker(repository,secondProvider,"sender@example.invalid",10,"https://app.example.test").runOnce()).toEqual({claimed:1,providerCalls:1});
    expect(repository).toMatchObject({attempts:2,status:"ProviderAccepted",envelopeActive:false});
    expect(firstProvider.evidence().redactedCalls[0].idempotencyKey).toBe(secondProvider.evidence().redactedCalls[0].idempotencyKey);
    expect(firstProvider.evidence().redactedCalls[0].containsReviewUrl).toBe(true);
    expect(await new TrustedNotificationWorker(repository,new FakeEmailDeliveryProvider(),"sender@example.invalid").runOnce()).toEqual({claimed:0,providerCalls:0});
  });
  it.each(["EXPIRED","SUPERSEDED"] as const)("suppresses %s batches without a provider call and retires the envelope",async state=>{
    const repository=new RetryRepository();repository.resolution={status:state};const provider=new FakeEmailDeliveryProvider("success");
    expect(await new TrustedNotificationWorker(repository,provider,"sender@example.invalid").runOnce()).toEqual({claimed:1,providerCalls:0});
    expect(repository.status).toBe(state==="SUPERSEDED"?"Superseded":"Cancelled");expect(repository.envelopeActive).toBe(false);expect(provider.evidence().callCount).toBe(0);
  });
  it("preserves FailedCredentialLost for a legacy credential intent without an envelope",async()=>{
    const repository=new RetryRepository();repository.envelopeActive=false;await new TrustedNotificationWorker(repository,new FakeEmailDeliveryProvider(),"sender@example.invalid").runOnce();
    expect(repository.status).toBe("FailedCredentialLost");
  });
  it("retains the envelope but prevents automatic retry after an unknown delivery outcome",async()=>{
    const repository=new RetryRepository();const provider={name:"fake",send:async()=>({accepted:false as const,provider:"fake",category:"NetworkException" as const,
      diagnostic:{deliveryOutcome:"UNKNOWN_DELIVERY_OUTCOME" as const,retryable:false,exceptionName:"TypeError"}})};
    await new TrustedNotificationWorker(repository,provider,"sender@example.invalid",10,"https://app.example.test").runOnce();
    expect(repository).toMatchObject({attempts:1,status:"UnknownOutcome",envelopeActive:true});
    expect(await new TrustedNotificationWorker(repository,new FakeEmailDeliveryProvider(),"sender@example.invalid").runOnce()).toEqual({claimed:0,providerCalls:0});
  });
});
