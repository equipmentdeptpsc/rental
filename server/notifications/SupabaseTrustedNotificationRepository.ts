import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationIntent } from "../../src/features/notifications/domain";
import type {
  ClaimedNotification, GroupedReviewDeliveryResolution, TrustedNotificationWorkerRepository,
} from "./TrustedNotificationWorker";
import type {
  TrustedReviewIssuanceRepository, TrustedReviewIssuanceResult,
} from "./TrustedReviewIssuanceOrchestrator";
import { randomUUID } from "node:crypto";
import { generateGroupedReviewCredential } from "./GroupedReviewCredential";
import { decryptGroupedReviewDeliveryEnvelope, encryptGroupedReviewDeliveryEnvelope,
  parseGroupedReviewDeliveryKey, type GroupedReviewDeliveryEnvelope } from "./GroupedReviewDeliveryEnvelope";
import { buildInvoiceDocument, type InvoiceDocument } from "../../src/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import type { BillingStatement, BillingStatementLine } from "../../src/features/rental/billingstatement/types";

type RpcResult<T> = { success: boolean; code?: string; disposition?: string; value?: T };

export class SupabaseTrustedNotificationRepository
implements TrustedNotificationWorkerRepository, TrustedReviewIssuanceRepository {
  constructor(
    private readonly authenticated: SupabaseClient,
    private readonly service: SupabaseClient,
    private readonly groupedReviewKey?: Buffer,
    private readonly publicReview?: SupabaseClient,
  ) {}

  private deliveryKey(): Buffer { return this.groupedReviewKey ?? parseGroupedReviewDeliveryKey(); }

  private async rpc<T>(client: SupabaseClient, name: string, parameters: Record<string, unknown>): Promise<T> {
    const result = await client.schema("erp").rpc(name, parameters);
    if (result.error) throw new Error(`${name} failed (${result.error.code ?? "transport"})`);
    return result.data as T;
  }

  async issue(kind: "customer" | "manager" | "grouped-customer", command: Record<string, unknown>): Promise<TrustedReviewIssuanceResult> {
    if (kind === "grouped-customer") {
      const actor = await this.authenticated.auth.getUser();
      if (actor.error || !actor.data.user) throw new Error("Grouped review actor is unavailable.");
      const notificationId = randomUUID();
      const credential = generateGroupedReviewCredential();
      const envelope = encryptGroupedReviewDeliveryEnvelope(credential.reviewPath, notificationId, this.deliveryKey());
      const result = await this.rpc<Record<string, any>>(this.service, "trusted_prepare_grouped_customer_review_delivery", {
        command: { ...command, actorId: actor.data.user.id, notificationId, credentialHash: credential.hash, ...envelope },
      });
      return { ...result, success: result?.success === true,
        ...(result?.disposition === "CREATED" ? { reviewPath: credential.reviewPath } : {}),
        notificationIntentId: result?.value?.notificationIntentId };
    }
    const name = kind === "customer" ? "trusted_issue_customer_review" : "trusted_issue_manager_review";
    const result = await this.rpc<Record<string, any>>(this.authenticated, name, { command });
    return {
      ...result,
      success: result?.success === true,
      reviewPath: result?.value?.notification?.reviewPath,
      notificationIntentId: result?.value?.notificationIntentId,
    };
  }

  async getGroupedReviewPath(id: string): Promise<string | undefined> {
    const result = await this.rpc<RpcResult<GroupedReviewDeliveryEnvelope>>(
      this.service, "get_grouped_review_delivery_envelope", { notification_id: id },
    );
    if (!result?.success || !result.value) return undefined;
    return decryptGroupedReviewDeliveryEnvelope(result.value, id, this.deliveryKey());
  }

  async resolveGroupedReviewDelivery(id: string): Promise<GroupedReviewDeliveryResolution> {
    const reviewPath = await this.getGroupedReviewPath(id);
    if (!reviewPath) return { status: "MISSING" };
    const credential = reviewPath.slice("/review/customer/grouped/".length);
    if (!this.publicReview) throw new Error("Public review client is unavailable.");
    const result = await this.rpc<RpcResult<unknown>>(
      this.publicReview, "get_customer_review_batch", { command: { credential } },
    );
    if (result.success) return { status: "ACTIVE", reviewPath };
    if (result.code === "EXPIRED" || result.code === "SUPERSEDED") return { status: result.code };
    return { status: "MISSING" };
  }

  async getIntent(id: string): Promise<NotificationIntent & { attempt: number }> {
    const result = await this.rpc<RpcResult<NotificationIntent & { attempt: number }>>(
      this.service, "get_notification_delivery_intent", { notification_id: id },
    );
    if (!result.success || !result.value) throw new Error("Notification intent is unavailable.");
    return result.value;
  }

  async claim(id: string, workerId: string): Promise<boolean> {
    const result = await this.rpc<RpcResult<unknown>>(this.service, "claim_notification_delivery", {
      notification_id: id, worker_id: workerId,
    });
    return result.success;
  }

  async claimBatch(workerId: string, limit: number): Promise<ClaimedNotification[]> {
    const result = await this.rpc<RpcResult<Array<{ id: string }>>>(
      this.service, "claim_notification_delivery_batch", { worker_id: workerId, batch_size: limit },
    );
    if (!result.success) return [];
    return Promise.all((result.value ?? []).filter(Boolean).map((item) => this.getIntent(item.id)));
  }

  async complete(input: Parameters<TrustedNotificationWorkerRepository["complete"]>[0]): Promise<void> {
    const completion=input.notificationType === "BILLING_STATEMENT_EMAIL" ? "complete_billing_statement_email_delivery" : input.notificationType === "CUSTOMER_GROUPED_REVIEW_REQUESTED" ? "complete_grouped_review_notification_delivery" : "complete_notification_delivery";
    const result = await this.rpc<RpcResult<unknown>>(this.service, completion, {
      command: {
        id: input.id, workerId: input.workerId, status: input.status,
        providerName: input.providerName, providerMessageId: input.providerMessageId,
        failureCategory: input.failureCategory, retryAfterSeconds: input.retryAfterSeconds,
        ...(["BILLING_STATEMENT_EMAIL","CUSTOMER_GROUPED_REVIEW_REQUESTED"].includes(input.notificationType??"") ? { uatOverrideApplied: input.uatOverrideApplied === true } : {}),
      },
    });
    if (!result.success) throw new Error(`Notification completion rejected (${result.code ?? "unknown"}).`);
  }

  async loadBillingStatementDocument(statementId: string, expectedCompanyId: string, sourceVersion: number): Promise<InvoiceDocument | undefined> {
    const statementResult = await this.service.schema("erp").from("billing_statements").select("*").eq("id", statementId).eq("company_id",expectedCompanyId).is("deleted_at", null).maybeSingle();
    if (statementResult.error || !statementResult.data) return undefined;
    const row = statementResult.data as Record<string, unknown>; const companyId = text(row.company_id); if(companyId!==expectedCompanyId||text(row.approval_status)!=="Approved"||number(row.row_version)!==sourceVersion)return undefined; const rentalId = text(row.rental_id);
    const [lineResult, rentalResult, collectionResult] = await Promise.all([
      this.service.schema("erp").from("billing_statement_lines").select("*").eq("billing_statement_id", statementId).eq("company_id", companyId),
      this.service.schema("erp").from("rentals").select("*").eq("id", rentalId).eq("company_id", companyId).maybeSingle(),
      this.service.schema("erp").from("collections").select("amount").eq("billing_statement_id", statementId).eq("company_id", companyId),
    ]);
    if (lineResult.error || rentalResult.error || !rentalResult.data || collectionResult.error) return undefined;
    const rental = rentalResult.data as Record<string, unknown>; const rawLines = (lineResult.data ?? []) as Record<string, unknown>[];
    const equipmentIds = [...new Set(rawLines.map(line => text(line.equipment_id)).filter(Boolean))]; const operatorIds = [...new Set(rawLines.map(line => text(line.operator_id)).filter(Boolean))]; const deurIds = rawLines.map(line => text(line.deur_id)).filter(Boolean);
    const [equipmentResult, operatorResult, deurResult] = await Promise.all([
      this.service.schema("erp").from("equipment").select("id,equipment_name,asset_no").in("id", equipmentIds.length ? equipmentIds : ["__none__"]).eq("company_id", companyId),
      this.service.schema("erp").from("operators").select("id,name").in("id", operatorIds.length ? operatorIds : ["__none__"]).eq("company_id", companyId),
      this.service.schema("erp").from("deurs").select("id,deur_number").in("id", deurIds.length ? deurIds : ["__none__"]).eq("company_id", companyId),
    ]);
    if (equipmentResult.error || operatorResult.error || deurResult.error) return undefined;
    const equipment = new Map(((equipmentResult.data ?? []) as Record<string, unknown>[]).map(item => [text(item.id), `${text(item.equipment_name)} (${text(item.asset_no)})`]));
    const operators = new Map(((operatorResult.data ?? []) as Record<string, unknown>[]).map(item => [text(item.id), text(item.name)]));
    const deurs = new Map(((deurResult.data ?? []) as Record<string, unknown>[]).map(item => [text(item.id), text(item.deur_number)]));
    const lines: BillingStatementLine[] = rawLines.map(line => ({ id:text(line.id),deurId:text(line.deur_id),rentalEquipmentLineId:text(line.rental_equipment_line_id)||undefined,equipmentId:text(line.equipment_id)||undefined,operatorId:text(line.operator_id)||undefined,deurReference:deurs.get(text(line.deur_id))||"DEUR number unavailable",equipmentLabel:equipment.get(text(line.equipment_id)),operatorLabel:operators.get(text(line.operator_id)),workDate:text(line.work_date),description:text(line.description),costCode:text(line.cost_code_snapshot),activityCode:text(line.activity_code_snapshot)||undefined,quantity:optionalNumber(line.quantity),unit:text(line.unit) as BillingStatementLine["unit"],unitRate:optionalNumber(line.unit_rate),billingMethod:text(line.billing_method),hours:number(line.hours),hourlyRate:number(line.hourly_rate),amount:number(line.amount),operatingCharge:number(line.operating_charge),idleCharge:number(line.idle_charge),idleHours:optionalNumber(line.idle_hours),standbyCharge:optionalNumber(line.standby_charge),standbyHours:optionalNumber(line.standby_hours),mobilizationCharge:number(line.mobilization_charge),demobilizationCharge:number(line.demobilization_charge),operatorCharge:number(line.operator_charge),fuelCharge:number(line.fuel_charge),vat:number(line.vat),withholdingTax:number(line.withholding_tax),grandTotal:number(line.grand_total) }));
    const statement: BillingStatement = { id:text(row.id),statementNo:text(row.statement_no),version:number(row.statement_version)||1,rentalId,equipmentId:text(row.legacy_equipment_id),operatorId:text(row.legacy_operator_id),customer:text(row.customer_snapshot),project:text(row.project_snapshot),billingFrom:text(row.billing_from),billingTo:text(row.billing_to),subtotal:number(row.subtotal),vat:number(row.vat),withholdingTax:number(row.withholding_tax),grandTotal:number(row.grand_total),approvalStatus:text(row.approval_status) as BillingStatement["approvalStatus"],invoiceStatus:text(row.invoice_status) as BillingStatement["invoiceStatus"],lines,createdBy:text(row.created_by),createdAt:text(row.created_at),rentalNumber:text(rental.rental_number),customerRepresentativeName:text(rental.customer_review_name_snapshot)||undefined,customerRepresentativeEmail:text(rental.customer_review_email_snapshot)||undefined };
    const collected=((collectionResult.data??[]) as Record<string,unknown>[]).reduce((sum,item)=>sum+number(item.amount),0); const total=statement.grandTotal??statement.subtotal;
    return buildInvoiceDocument(statement,[],[],text(row.currency)||"PHP",{amountCollected:collected,outstandingBalance:Math.max(0,total-collected)});
  }
}

function text(value:unknown){return typeof value==="string"?value:"";} function number(value:unknown){const result=Number(value);return Number.isFinite(result)?result:0;} function optionalNumber(value:unknown){return value===null||value===undefined?undefined:number(value);}
