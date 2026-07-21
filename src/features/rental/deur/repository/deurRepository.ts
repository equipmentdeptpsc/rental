import type { DeurCorrectionReasonCode, DeurRecord } from "../types";
import { storage } from "@/core/storage";
import { generateDeurNumber, normalizeDeur } from "../services/canonicalDeur";
import { submitDeur, acknowledgeDeur, rejectDeur, reopenDeur } from "../services/reviewLifecycle";
import { deurSyncQueue } from "../offline/deurSyncQueue";
import type { DeurQueueOperation } from "../offline/types";
import { DEUR_STORAGE_KEY, notifyDeurChange } from "../synchronization/deurChangeNotifications";
import { createDeurCorrectionRevision } from "../services/correction/createDeurCorrectionRevision";
import { applyDigitalDeurOperatorAction } from "../operator/applyDigitalDeurOperatorAction";
import type { DeurOperatorAction } from "../operator/types";
import type { RentalRecord } from "../../types";
import { resolveLegacyDeurRentalEquipmentLine } from "../services/resolveDeurRentalEquipmentLine";

const STORAGE_KEY = DEUR_STORAGE_KEY;

class DeurRepository {

  private protectRevision(existing: DeurRecord, incoming: DeurRecord) {
    if (!existing.revision) return incoming.revision;
    return {
      ...incoming.revision,
      chainId: existing.revision.chainId,
      revisionNumber: existing.revision.revisionNumber,
      originalDeurId: existing.revision.originalDeurId,
      previousRevisionId: existing.revision.previousRevisionId,
      correctionReasonCode: existing.revision.correctionReasonCode,
      correctionReasonDetails: existing.revision.correctionReasonDetails,
      correctedByName: existing.revision.correctedByName,
      correctedByUserId: existing.revision.correctedByUserId,
      correctedAt: existing.revision.correctedAt,
      supersedesRevisionId: existing.revision.supersedesRevisionId ?? incoming.revision?.supersedesRevisionId,
      supersededByRevisionId: existing.revision.supersededByRevisionId ?? incoming.revision?.supersededByRevisionId,
      supersededAt: existing.revision.supersededAt ?? incoming.revision?.supersededAt,
      supersededByName: existing.revision.supersededByName ?? incoming.revision?.supersededByName,
    };
  }

  getAll(): DeurRecord[] {

    try {
      const records = storage.get<unknown>(STORAGE_KEY);
      return Array.isArray(records) ? records.map((record) => normalizeDeur(record as DeurRecord)) : [];
    } catch {
      return [];
    }

  }

  getById(id: string) {
    return this.getAll().find(
      x => x.id === id
    );
  }

  getByRentalId(
    rentalId: string
  ) {

    return this.getAll().filter(
      x => x.rentalId === rentalId
    );

  }

  create(record: DeurRecord) {

    const all =
      this.getAll();

    const created = normalizeDeur({ ...structuredClone(record), deurNumber: record.deurNumber ?? generateDeurNumber(all) });
    all.push(created);

    return this.persistMutation(all, created, "create", created);

  }

  update(record: DeurRecord) {
    const records = this.getAll();
    const existing = records.find((item) => item.id === record.id);
    if (!existing) return undefined;
    const protectedRecord = structuredClone(record);
    protectedRecord.creationSource = existing.creationSource;
    protectedRecord.rentalId = existing.rentalId;
    protectedRecord.rentalEquipmentLineId = existing.rentalEquipmentLineId;
    protectedRecord.equipmentId = existing.equipmentId;
    protectedRecord.assignmentId = existing.assignmentId;
    protectedRecord.operatorId = existing.operatorId;
    protectedRecord.manualMetadata = existing.manualMetadata;
    protectedRecord.evidenceMode = existing.evidenceMode;
    protectedRecord.billingMethodSnapshot = existing.billingMethodSnapshot;
    protectedRecord.commercialSnapshot = existing.commercialSnapshot;
    protectedRecord.commercialSnapshotRequired = existing.commercialSnapshotRequired;
    protectedRecord.revision = this.protectRevision(existing, protectedRecord);
    if(["Submitted","Acknowledged","Rejected","Billed"].includes(existing.status)){
      protectedRecord.workDate=existing.workDate;
      protectedRecord.reportDate=existing.reportDate;
      protectedRecord.shift=existing.shift;
      protectedRecord.odometerTripEvidence=existing.odometerTripEvidence;
      protectedRecord.quantityEvidence=existing.quantityEvidence;
      protectedRecord.completionEvidence=existing.completionEvidence;
    }

    const updated =
      records.map(x =>
        x.id === record.id
          ? protectedRecord
          : x
      );

    return this.persistMutation(updated, normalizeDeur(protectedRecord), "update", protectedRecord);

  }

  getByRentalEquipmentLineId(rentalEquipmentLineId: string) {
    return this.getAll().filter((record) => record.rentalEquipmentLineId === rentalEquipmentLineId);
  }

  backfillRentalEquipmentLineIds(rentals: RentalRecord[]) {
    const records = this.getAll();
    const issues: Array<{ deurId: string; code: string; message: string }> = [];
    let changed = false;
    const migrated = records.map((record) => {
      if (record.rentalEquipmentLineId) return record;
      const resolution = resolveLegacyDeurRentalEquipmentLine(record, rentals);
      if (!resolution.success) { issues.push({ deurId: record.id, ...resolution.issue }); return record; }
      changed = true;
      return { ...record, rentalEquipmentLineId: resolution.line.id };
    });
    if (changed) this.saveAll(migrated);
    return { changed, records: structuredClone(migrated), issues };
  }

  applyOperatorAction(input: { deurId: string; expectedUpdatedAt: string; action: DeurOperatorAction; actionTimestamp: string; actor: { id?: string; name: string; role?: string } }) {
    const current = this.getAll();
    const latest = current.find((record) => record.id === input.deurId);
    if (!latest) return { success: false as const, code: "DEUR_NOT_FOUND", message: "DEUR not found." };
    if (latest.updatedAt !== input.expectedUpdatedAt) return { success: false as const, code: "DEUR_STALE_VERSION", message: "This DEUR changed in another view. Latest data has been reloaded.", latest: structuredClone(latest) };
    const result = applyDigitalDeurOperatorAction({ deur: latest, action: input.action, actionTimestamp: input.actionTimestamp, actor: input.actor });
    if (!result.success) return result;
    const records = current.map((record) => record.id === latest.id ? result.record : record);
    const persisted = this.persistMutation(records, result.record, "update", result.record);
    return { success: true as const, record: persisted, createdEvents: result.createdEvents };
  }

  /** Persists a reconciled inbound snapshot without creating an outbound echo. */
  applyInbound(record: DeurRecord) {
    const records = this.getAll();
    const existing = records.find((item) => item.id === record.id);
    const incoming = structuredClone(record);
    if (existing) {
      incoming.rentalId = existing.rentalId;
      incoming.rentalEquipmentLineId = existing.rentalEquipmentLineId;
      incoming.equipmentId = existing.equipmentId;
      incoming.assignmentId = existing.assignmentId;
      incoming.operatorId = existing.operatorId;
    }
    if (existing) incoming.revision = this.protectRevision(existing, incoming);
    if (existing && ["Submitted","Acknowledged","Rejected","Billed"].includes(existing.status)) {
      incoming.workDate = existing.workDate;
      incoming.reportDate = existing.reportDate;
      incoming.shift = existing.shift;
    }
    const normalized = normalizeDeur({ ...incoming, ...(existing?.commercialSnapshot ? { commercialSnapshot: existing.commercialSnapshot, commercialSnapshotRequired: existing.commercialSnapshotRequired } : {}) });
    const exists = records.some((item) => item.id === normalized.id);
    this.saveAll(exists
      ? records.map((item) => item.id === normalized.id ? normalized : item)
      : [...records, normalized]);
    notifyDeurChange(normalized);
    return structuredClone(normalized);
  }

  /** Deletes reconciled inbound state without creating an outbound echo. */
  deleteInbound(id: string) {
    const existing = this.getById(id);
    if (!existing) return false;
    this.saveAll(this.getAll().filter((item) => item.id !== id));
    notifyDeurChange(existing);
    return true;
  }

  submit(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => submitDeur(record, actor), "submit"); }
  acknowledge(id: string, actor: { name: string; id?: string }) {
    const record = this.getById(id);
    if (record?.revision?.previousRevisionId) return this.acknowledgeCorrection(id, actor);
    return this.review(id, (item) => acknowledgeDeur(item, actor), "acknowledge");
  }
  reject(id: string, actor: { name: string; id?: string }, reason: string) { return this.review(id, (record) => rejectDeur(record, actor, reason), "reject"); }
  reopen(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => reopenDeur(record, actor), "reopen"); }

  createCorrection(input: {
    sourceId: string;
    reasonCode: DeurCorrectionReasonCode;
    reasonDetails?: string;
    actor: { id?: string; name: string; role?: string };
    timestamp?: string;
    newId?: string;
  }) {
    const source = this.getById(input.sourceId);
    if (!source) return { success: false as const, code: "DEUR_NOT_FOUND", message: "DEUR not found." };
    const chainId = source.revision?.chainId ?? source.id;
    const chain = this.getAll().filter((item) => (item.revision?.chainId ?? item.id) === chainId);
    const timestamp = input.timestamp ?? new Date().toISOString();
    const result = createDeurCorrectionRevision({
      source, chain, reasonCode: input.reasonCode, reasonDetails: input.reasonDetails,
      actor: input.actor, timestamp, newId: input.newId ?? crypto.randomUUID(),
      newDeurNumber: generateDeurNumber(this.getAll()),
    });
    if (!result.success) return result;
    const records = this.getAll().map((item) => item.id === source.id ? normalizeDeur(result.sourceRevision) : item);
    const revision = normalizeDeur(result.revision);
    records.push(revision);
    this.saveAll(records);
    this.enqueue(result.sourceRevision, "update", result.sourceRevision);
    this.enqueue(revision, "create", revision);
    notifyDeurChange(result.sourceRevision);
    notifyDeurChange(revision);
    return { success: true as const, sourceRevision: structuredClone(result.sourceRevision), revision: structuredClone(revision) };
  }

  acknowledgeCorrection(id: string, actor: { name: string; id?: string }, timestamp = new Date().toISOString()) {
    const records = this.getAll();
    const correction = records.find((item) => item.id === id);
    const previousId = correction?.revision?.previousRevisionId;
    const previous = records.find((item) => item.id === previousId);
    if (!correction || !previous) return { success: false as const, message: "The correction revision chain is incomplete." };
    const acknowledged = acknowledgeDeur(correction, actor, timestamp);
    if (!acknowledged.success) return acknowledged;
    if (previous.revision?.supersededByRevisionId || correction.revision?.supersedesRevisionId) {
      return { success: false as const, message: "The correction revision was already resolved." };
    }
    const replacement: DeurRecord = {
      ...acknowledged.record,
      revision: { ...acknowledged.record.revision!, supersedesRevisionId: previous.id },
    };
    const superseded: DeurRecord = {
      ...previous,
      updatedAt: timestamp,
      revision: {
        ...(previous.revision ?? { chainId: correction.revision!.chainId, revisionNumber: 1, originalDeurId: correction.revision!.originalDeurId }),
        supersededByRevisionId: replacement.id,
        supersededAt: timestamp,
        supersededByName: actor.name,
      },
    };
    this.saveAll(records.map((item) => item.id === superseded.id ? superseded : item.id === replacement.id ? replacement : item));
    this.enqueue(superseded, "update", superseded);
    this.enqueue(replacement, "acknowledge", replacement);
    notifyDeurChange(superseded);
    notifyDeurChange(replacement);
    return { success: true as const, record: structuredClone(replacement), superseded: structuredClone(superseded) };
  }

  private review(id: string, operation: (record: DeurRecord) => { success: true; record: DeurRecord } | { success: false; message: string }, queueOperation: DeurQueueOperation) {
    const record = this.getById(id);
    if (!record) return { success: false as const, message: "DEUR not found." };
    const result = operation(record);
    if (!result.success) return result;
    const records = this.getAll().map((item) => item.id === id ? result.record : item);
    return { success: true as const, record: this.persistMutation(records, result.record, queueOperation, result.record) };
  }

  delete(id: string) {

    const deleted = this.getById(id);
    if (!deleted) return undefined;
    this.persistMutation(this.getAll().filter(x => x.id !== id), deleted, "delete", { id: deleted.id });
    return deleted;

  }

  lockBilling(
    deurIds: string[],
    billingStatementId: string
  ) {

    const updated =
      this.getAll().map(deur => {

        if (
          deurIds.includes(deur.id)
        ) {

          return {

            ...deur,

            billingLocked: true,

            billingStatementId,

          };

        }

        return deur;

      });

    this.saveAll(updated);
    updated.filter((record) => deurIds.includes(record.id)).forEach(notifyDeurChange);

  }

  unlockBilling(
    billingStatementId: string
  ) {
    const affectedIds = new Set(this.getAll().filter((record) => record.billingStatementId === billingStatementId).map((record) => record.id));

    const updated =
      this.getAll().map(deur => {

        if (
          deur.billingStatementId !==
          billingStatementId
        ) {

          return deur;

        }

        return {

          ...deur,

          billingLocked: false,

          billingStatementId: undefined,

        };

      });

    this.saveAll(updated);
    updated.filter((record) => affectedIds.has(record.id)).forEach(notifyDeurChange);

  }

  private saveAll(
    records: DeurRecord[]
  ) {

    storage.set(STORAGE_KEY, structuredClone(records));

  }

  private persistMutation(records: DeurRecord[], record: DeurRecord, operation: DeurQueueOperation, payload: unknown) {
    const normalized = normalizeDeur(record);
    this.saveAll(records.map((item) => item.id === normalized.id ? normalized : item));
    this.enqueue(normalized, operation, payload);
    notifyDeurChange(normalized);
    return structuredClone(normalized);
  }

  private enqueue(record: DeurRecord, operation: DeurQueueOperation, payload: unknown) {
    deurSyncQueue.enqueue({ id: crypto.randomUUID(), aggregateId: record.id, aggregateType: "DEUR", operation, payload: structuredClone(payload), createdAt: new Date().toISOString() });
  }

}

export const deurRepository =
  new DeurRepository();
