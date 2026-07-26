import { storage } from "@/core/storage";
import type { DevelopmentApprovalEmail, DevelopmentApprovalEmailStatus, ManagerApprovalEmailSnapshot } from "./types";
import { managerApprovalEmailSubject, renderManagerApprovalEmail } from "./renderManagerApprovalEmail";

export const DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY = "equipment-rental-development-approval-email-outbox";
export const APPROVAL_EMAIL_EXPIRY_HOURS = 72;
const clone = <T>(value: T): T => structuredClone(value);

export const developmentApprovalEmailOutbox = {
  getAll(now = new Date().toISOString()): DevelopmentApprovalEmail[] {
    const records = clone(storage.get<DevelopmentApprovalEmail[]>(DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY) ?? []);
    let changed = false;
    const normalized = records.map((record) => {
      if (record.status === "Pending" && new Date(record.expiresAt).getTime() <= new Date(now).getTime()) {
        changed = true;
        return { ...record, status: "Expired" as const };
      }
      return record;
    });
    if (changed) storage.set(DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY, normalized);
    return normalized;
  },
  getById(id: string) { return this.getAll().find((record) => record.id === id); },
  getByToken(token: string) { return this.getAll().find((record) => record.approvalToken === token); },
  create(input: { rentalId: string; recipientName: string; recipient: string; generatedAt: string; snapshot: ManagerApprovalEmailSnapshot }): DevelopmentApprovalEmail {
    const approvalToken = crypto.randomUUID();
    const id = crypto.randomUUID();
    const expiresAt = new Date(new Date(input.generatedAt).getTime() + APPROVAL_EMAIL_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    const approvalUrl = `/rental-approval/${approvalToken}`;
    const record: DevelopmentApprovalEmail = { id, rentalId: input.rentalId, recipientName: input.recipientName, recipient: input.recipient, subject: managerApprovalEmailSubject(input.snapshot), generatedAt: input.generatedAt, rentalNumber: input.snapshot.rentalNumber, approvalToken, expiresAt, status: "Pending", snapshot: clone(input.snapshot), html: renderManagerApprovalEmail(input.snapshot, approvalUrl) };
    storage.set(DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY, [...this.getAll(input.generatedAt), record]);
    return clone(record);
  },
  setDecision(rentalId: string, status: Extract<DevelopmentApprovalEmailStatus, "Approved" | "Rejected">, timestamp: string) {
    const records = this.getAll(timestamp);
    let updated: DevelopmentApprovalEmail | undefined;
    const next = records.map((record) => {
      if (record.rentalId !== rentalId || record.status !== "Pending") return record;
      updated = { ...record, status, decisionAt: timestamp };
      return updated;
    });
    if (updated) storage.set(DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY, next);
    return updated ? clone(updated) : undefined;
  },
};
