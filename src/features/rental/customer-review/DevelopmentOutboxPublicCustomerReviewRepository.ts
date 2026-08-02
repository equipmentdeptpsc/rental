import type { PublicCustomerReviewRepository, PublicDeurReviewSnapshot, PublicReviewFailureCode, PublicReviewResult } from "./publicReviewContracts";
import { developmentCustomerReviewOutbox, type CustomerReviewOutboxEntry } from "./developmentCustomerReviewOutbox";

function failure(entry: CustomerReviewOutboxEntry | undefined): PublicReviewFailureCode {
  if (!entry) return "INVALID_OR_UNAVAILABLE";
  if (entry.status === "Expired") return "EXPIRED";
  if (entry.status === "Superseded") return "SUPERSEDED";
  return "ALREADY_COMPLETED";
}

function snapshot(entry: CustomerReviewOutboxEntry): PublicDeurReviewSnapshot {
  return {
    rentalReference: entry.rentalNumber, customerName: entry.customerName, project: entry.snapshot.project,
    equipment: entry.snapshot.equipment, operator: entry.snapshot.operator, workDate: entry.snapshot.workDate,
    shift: entry.snapshot.shift, operationMinutes: entry.snapshot.operationMinutes, idleMinutes: entry.snapshot.idleMinutes,
    standbyMinutes: entry.snapshot.standbyMinutes ?? 0, breakdownMinutes: entry.snapshot.breakdownMinutes,
    submittedRevision: `R${entry.revisionNumber}`, submittedAt: entry.snapshot.submittedAt,
    timeline: (entry.snapshot.timeline ?? []).flatMap((item, index) => [
      { activity: item.activityType ?? item.label ?? "Activity", action: "start" as const, occurredAt: item.start, sequence: index * 2 + 1 },
      ...(item.end ? [{ activity: item.activityType ?? item.label ?? "Activity", action: "end" as const, occurredAt: item.end, sequence: index * 2 + 2 }] : []),
    ]),
    reviewStatus: "Pending", availableActions: ["ACKNOWLEDGE", "REQUEST_CORRECTION"], expiresAt: entry.expiresAt,
  };
}

export class DevelopmentOutboxPublicCustomerReviewRepository implements PublicCustomerReviewRepository {
  async getSnapshot(credential: string): Promise<PublicReviewResult<PublicDeurReviewSnapshot>> {
    const entry = developmentCustomerReviewOutbox.getByToken(credential);
    return entry?.status === "Pending" ? { success: true, disposition: "AVAILABLE", value: snapshot(entry) } : { success: false, code: failure(entry) };
  }
  async acknowledge(credential: string): Promise<PublicReviewResult<{ reviewStatus: "Acknowledged" }>> {
    const entry = developmentCustomerReviewOutbox.getByToken(credential);
    if (!entry || entry.status !== "Pending") return { success: false, code: failure(entry) };
    return developmentCustomerReviewOutbox.decide(credential, "Acknowledged") ? { success: true, disposition: "ACCEPTED", value: { reviewStatus: "Acknowledged" } } : { success: false, code: "INVALID_OR_UNAVAILABLE" };
  }
  async requestCorrection(credential: string): Promise<PublicReviewResult<{ reviewStatus: "CorrectionRequested" }>> {
    const entry = developmentCustomerReviewOutbox.getByToken(credential);
    if (!entry || entry.status !== "Pending") return { success: false, code: failure(entry) };
    return developmentCustomerReviewOutbox.decide(credential, "CorrectionRequested") ? { success: true, disposition: "ACCEPTED", value: { reviewStatus: "CorrectionRequested" } } : { success: false, code: "INVALID_OR_UNAVAILABLE" };
  }
}

export const developmentOutboxPublicCustomerReviewRepository = new DevelopmentOutboxPublicCustomerReviewRepository();
