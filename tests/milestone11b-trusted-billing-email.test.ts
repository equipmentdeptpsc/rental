// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedNotificationWorker, type TrustedNotificationWorkerRepository } from "../server/notifications/TrustedNotificationWorker";
import type { EmailDeliveryProvider, EmailDeliveryRequest } from "@/features/notifications/EmailDeliveryProvider";
import { buildInvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import InvoiceDocumentView from "@/features/rental/workspace/invoice/InvoiceDocumentView";
import type { BillingStatement } from "@/features/rental/billingstatement/types";

const sql=readFileSync("supabase/migrations/20260821000200_trusted_billing_statement_email.sql","utf8");
const statement:BillingStatement={id:"statement-1",statementNo:"BS-1",version:3,rentalId:"rental-1",rentalNumber:"R-1",equipmentId:"equipment-1",operatorId:"operator-1",customer:"Customer",customerRepresentativeName:"Billing Contact",customerRepresentativeEmail:"billing@example.test",project:"Project",billingFrom:"2026-08-01",billingTo:"2026-08-21",subtotal:100,grandTotal:100,approvalStatus:"Approved",invoiceStatus:"Invoiced",createdBy:"Finance",createdAt:"2026-08-21T00:00:00Z",lines:[{id:"line-1",deurId:"deur-1",deurReference:"DEUR-1",rentalEquipmentLineId:"rental-line-1",equipmentId:"equipment-1",operatorId:"operator-1",equipmentLabel:"Excavator EX-1",operatorLabel:"Operator",workDate:"2026-08-21",description:"Operating Hours",costCode:"RENT",billingMethod:"Per Hour",hours:1,hourlyRate:100,amount:100,operatingCharge:100,grandTotal:100}]};
const invoiceDocument=buildInvoiceDocument(statement,[],[],"PHP",{amountCollected:0,outstandingBalance:100});

describe("Milestone 11B.1 trusted Billing email migration",()=>{
  it("uses an authenticated tenant-scoped billing.update command with minimal browser input",()=>{
    for(const marker of ["command_send_billing_statement_email","auth.uid()","current_company_id()","current_user_has_permission('billing.update')","CUSTOMER_EMAIL_MISSING","BILLING_STATEMENT_EMAIL","BILLING_STATEMENT_EMAIL_SENT"])expect(sql).toContain(marker);
    expect(sql).toContain("k NOT IN('statementId','commandId','idempotencyKey','expectedVersion')");
    expect(sql).not.toMatch(/command->>'(?:recipientEmail|companyId|customerId|rentalId|amount|pdf|actorId)'/);
    expect(sql).toContain("TO authenticated");expect(sql).toContain("complete_billing_statement_email_delivery");
  });
  it("stores no PDF or secrets and exposes a permission-scoped status projection",()=>{
    expect(sql).not.toMatch(/pdf_(?:bytes|content)|resend_api|service_role_key|access_token|password|pin_data/i);
    expect(sql).toContain("get_billing_statement_email_status");expect(sql).toContain("current_user_has_permission('billing.read')");
  });
});

describe("Milestone 11B.1 Worker Billing delivery",()=>{
  it("reloads the canonical document, attaches one PDF, and records provider acceptance",async()=>{
    let request:EmailDeliveryRequest|undefined;const provider:EmailDeliveryProvider={name:"fake",send:async value=>(request=value,{accepted:true,provider:"fake",providerMessageId:"provider-1"})};
    const loadBillingStatementDocument=vi.fn(async()=>invoiceDocument);const complete=vi.fn();const repository:TrustedNotificationWorkerRepository={claimBatch:async()=>[{id:"notification-1",companyId:"tenant",type:"BILLING_STATEMENT_EMAIL",recipient:{destination:"billing@example.test",displayName:"Billing Contact"},sourceAggregateType:"BILLING_STATEMENT",sourceAggregateId:"statement-1",templateVersion:1,idempotencyKey:"billing-email-1",input:{recipientName:"Billing Contact",companyName:"Company",rentalReference:"R-1",sourceVersion:3},attempt:1}],complete,loadBillingStatementDocument};
    await expect(new TrustedNotificationWorker(repository,provider,"sender@example.test",1,"https://uat.test",undefined,true).runOnce("00000000-0000-4000-8000-000000000001")).resolves.toEqual({claimed:1,providerCalls:1});
    expect(request?.attachments).toEqual([expect.objectContaining({filename:"Billing-Statement-BS-1.pdf",contentType:"application/pdf",contentBase64:expect.any(String)})]);
    expect(request?.email.subject).toBe("Billing Statement BS-1 — Rental R-1");
    expect(loadBillingStatementDocument).toHaveBeenCalledWith("statement-1","tenant",3);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({status:"ProviderAccepted",notificationType:"BILLING_STATEMENT_EMAIL",uatOverrideApplied:true}));
  });
  it("dead-letters a stale queued source version without calling the provider",async()=>{
    const provider:EmailDeliveryProvider={name:"fake",send:vi.fn()};const complete=vi.fn();
    const repository:TrustedNotificationWorkerRepository={claimBatch:async()=>[{id:"notification-stale",companyId:"tenant",type:"BILLING_STATEMENT_EMAIL",recipient:{destination:"billing@example.test",displayName:"Billing Contact"},sourceAggregateType:"BILLING_STATEMENT",sourceAggregateId:"statement-1",templateVersion:1,idempotencyKey:"billing-email-stale",input:{recipientName:"Billing Contact",companyName:"Company",rentalReference:"R-1",sourceVersion:3},attempt:1}],complete,loadBillingStatementDocument:async(_statementId,_companyId,sourceVersion)=>sourceVersion===4?invoiceDocument:undefined};
    await expect(new TrustedNotificationWorker(repository,provider,"sender@example.test").runOnce("00000000-0000-4000-8000-000000000002")).resolves.toEqual({claimed:1,providerCalls:0});
    expect(provider.send).not.toHaveBeenCalled();expect(complete).toHaveBeenCalledWith(expect.objectContaining({status:"DeadLetter",failureCategory:"Cancelled",notificationType:"BILLING_STATEMENT_EMAIL"}));
  });
});

describe("Milestone 11B.1 Billing UI",()=>{let root:Root|undefined;afterEach(async()=>{if(root)await act(async()=>root?.unmount());document.body.innerHTML="";root=undefined;});
  it("queues through the trusted command once and leaves PDF download independent",async()=>{let resolve!:()=>void;const pending=new Promise<void>(done=>resolve=done);const enqueue=vi.fn(async()=>{await pending;return{success:true as const,disposition:"ACCEPTED" as const,value:{notificationId:"n",status:"Pending"}}});const container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root?.render(createElement(InvoiceDocumentView,{document:invoiceDocument,emailRepository:{enqueue}})));const send=[...container.querySelectorAll("button")].find(button=>button.textContent==="Send Billing Statement")!;act(()=>{send.click();send.click();});expect(enqueue).toHaveBeenCalledTimes(1);expect(send.textContent).toBe("Sending...");expect(container.textContent).toContain("Download PDF");await act(async()=>resolve());expect(container.textContent).toContain("Billing Statement queued for email delivery.");});
});
