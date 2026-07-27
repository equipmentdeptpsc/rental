import type { RentalLifecycleStatus, RentalRecord } from "@/features/rental/types";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import type { DeurCompletionEvidence, DeurCreationSource, DeurOdometerCheckpoint, DeurQuantityEvidence, DeurRecord, ManualDeurMetadata, ManualDeurReason } from "../types";
import { deurRepository } from "../repository/deurRepository";
import { createDeurOperationalMetadataSnapshot } from "./createDeurOperationalMetadataSnapshot";
import { canCreateManualDeur } from "./manualDeurAuthorization";
import { buildManualDeurTimeline, type ManualDeurTimelineEntry } from "./buildManualDeurTimeline";
import { resolveDeurEvidenceMode } from "./resolveDeurEvidenceMode";
import { normalizeCompletionEvidence,normalizeOdometerTripEvidence,normalizeQuantityEvidence } from "./deurEvidence";
import { createDeurCommercialSnapshot } from "./createDeurCommercialSnapshot";
import { calendarDateAt, isCalendarDate } from "../expectation/dateRules";
import { resolveDeurRentalEquipmentLine } from "./resolveDeurRentalEquipmentLine";
import type { User } from "@/features/auth/domain/user";
import { assertMutationPermission } from "@/features/auth/services/assertMutationPermission";

export const MANUAL_DEUR_REASONS: readonly ManualDeurReason[] = ["POWER_NOT_AVAILABLE","SITE_COMPUTER_NOT_AVAILABLE","TECHNICAL_DIFFICULTY","DEVICE_MALFUNCTION","OPERATOR_DEVICE_NOT_ISSUED","APPLICATION_UNAVAILABLE","INTERNET_UNAVAILABLE","DELAYED_DIGITAL_DEPLOYMENT","PHYSICAL_DEUR_USED_AS_BACKUP","OTHER"];

export interface CreateDeurRequest {
  authenticatedUser?: User | null;
  rentalId: string;
  rentalEquipmentLineId?: string;
  rentalStatus: RentalLifecycleStatus;
  equipmentId: string;
  operatorId: string;
  assignmentId?: string;
  projectId?: string;
  customerId?: string;
  rental?: RentalRecord;
  selectedWorkDescription?: WorkDescriptionRecord;
  remarks?: string;
  source?: DeurCreationSource;
  workDate?: string;
  shiftStart?: string;
  shift?: DeurRecord["shift"];
  billingMethod?: string;
  odometerCheckpoints?: DeurOdometerCheckpoint[];
  quantityEvidence?: DeurQuantityEvidence;
  completionEvidence?: DeurCompletionEvidence;
}

export interface CreateManualDeurRequest extends CreateDeurRequest {
  source: "RENTAL_COMPANY_MANUAL";
  workDate: string;
  actor: { id?: string; name: string; role?: string };
  timeline?: ManualDeurTimelineEntry[];
  manualMetadata: Pick<ManualDeurMetadata,"reason"|"reasonDetails"|"physicalDeurReference"|"sourceDocumentDate"|"operatorConfirmed"|"operatorConfirmedAt"|"operatorConfirmedByName"|"remarks">;
}

export type CreateDeurResult =
  | { success: true; record: DeurRecord }
  | { success: false; message: string };

export function getDeurCreationError(request: CreateDeurRequest): string | undefined {
  if (!['Released', 'Active'].includes(request.rentalStatus)) {
    if (request.rentalStatus === "Returned") {
      return "Returned rentals cannot create new DEUR records.";
    }

    if (request.rentalStatus === "Closed") {
      return "Closed rentals cannot create new DEUR records.";
    }

    if (request.rentalStatus === "Cancelled") {
      return "Cancelled rentals cannot create new DEUR records.";
    }

    return "Release the rental before creating a DEUR.";
  }

  const required: Array<[string, string | undefined]> = [
    ["rental", request.rentalId],
    ["equipment", request.equipmentId],
    ["operator", request.operatorId],
  ];
  const missing = required.find(([, value]) => !value?.trim());

  if (missing) {
    return `Missing required ${missing[0]} relationship.`;
  }
  const lineResolution = request.rental ? resolveDeurRentalEquipmentLine({ rental: request.rental, rentalEquipmentLineId: request.rentalEquipmentLineId, equipmentId: request.equipmentId, assignmentId: request.assignmentId, operatorId: request.operatorId }) : undefined;
  if (lineResolution && !lineResolution.success) return lineResolution.issue.message;

  const policy = request.rental?.deurExpectationPolicy;
  const now = new Date().toISOString();
  const workDate=request.workDate??calendarDateAt(now,policy?.timezone)??now.split("T")[0];
  if (!isCalendarDate(workDate)) return "Enter a valid DEUR work date.";
  if (policy?.frequency === "PER_SHIFT" && !request.shift) return "Select the DEUR shift required by this Rental policy.";
  if (policy?.frequency === "PER_SHIFT" && request.shift && !policy.expectedShiftCodes?.includes(request.shift === "Day" ? "DAY" : "NIGHT")) return "The selected DEUR shift is not configured on this Rental.";
  const resolvedLineId = lineResolution?.success ? lineResolution.line.id : request.rentalEquipmentLineId;
  const hasActiveDeur = deurRepository.getByRentalId(request.rentalId).some(
    (record) => (record.rentalEquipmentLineId ? record.rentalEquipmentLineId === resolvedLineId : record.equipmentId === request.equipmentId) && record.workDate === workDate && record.status !== "Rejected" && (
      policy?.frequency !== "PER_SHIFT" || record.shift === request.shift
    )
  );

  if (hasActiveDeur) {
    return "A DEUR already exists for this rental.";
  }

  return undefined;
}

export function createDeur(request: CreateDeurRequest): CreateDeurResult {
  assertMutationPermission(request.authenticatedUser, "deur.create");
  const error = getDeurCreationError(request);
  if (error) return { success: false, message: error };
  if (!request.rental) return { success: false, message: "Rental operational metadata is required to create a DEUR." };
  const lineResolution=resolveDeurRentalEquipmentLine({rental:request.rental,rentalEquipmentLineId:request.rentalEquipmentLineId,equipmentId:request.equipmentId,assignmentId:request.assignmentId,operatorId:request.operatorId});if(!lineResolution.success)return{success:false,message:lineResolution.issue.message};
  const line=lineResolution.line;
  const commercial=line.commercialSnapshot?{success:true as const,snapshot:structuredClone(line.commercialSnapshot)}:createDeurCommercialSnapshot(request.rental);if(!commercial.success)return{success:false,message:commercial.message};

  const metadata = createDeurOperationalMetadataSnapshot({
    rental: { ...request.rental, operationalMetadata: line.operationalMetadata ?? request.rental.operationalMetadata },
    selectedWorkDescription: request.selectedWorkDescription,
    remarks: request.remarks,
  });
  if (!metadata.complete) return { success: false, message: metadata.issues[0].message };

  const timestamp = new Date().toISOString();
  const workDate = request.workDate ?? calendarDateAt(timestamp, request.rental.deurExpectationPolicy?.timezone) ?? timestamp.split("T")[0];
  const billingMethod=commercial.snapshot?.billingMethod??request.billingMethod??request.rental.billingMethod;
  const resolved=resolveDeurEvidenceMode(billingMethod);
  const evidenceMode=resolved.supported?resolved.mode:undefined;
  const odometerTripEvidence=evidenceMode==="ODOMETER_TRIP"?normalizeOdometerTripEvidence({checkpoints:request.odometerCheckpoints}):undefined;
  const quantityEvidence=evidenceMode==="QUANTITY"?normalizeQuantityEvidence(request.quantityEvidence):undefined;
  const completionEvidence=evidenceMode==="COMPLETION"?normalizeCompletionEvidence(request.completionEvidence):undefined;
  if(evidenceMode==="ODOMETER_TRIP"&&!odometerTripEvidence)return{success:false,message:"Starting location and odometer are required."};
  if(evidenceMode==="QUANTITY"&&!quantityEvidence)return{success:false,message:"Valid quantity evidence is required."};
  if(evidenceMode==="COMPLETION"&&!completionEvidence)return{success:false,message:"Valid completion evidence is required."};
  const record: DeurRecord = {
    id: crypto.randomUUID(),
    rentalId: request.rentalId,
    rentalEquipmentLineId: line.id,
    assignmentId: line.assignmentId,
    equipmentId: line.equipmentId,
    operatorId: line.operatorId,
    projectId: request.projectId,
    customerId: request.customerId,
    creationSource: "OPERATOR_DIGITAL",
    evidenceMode,
    billingMethodSnapshot:typeof billingMethod==="string"?billingMethod:undefined,
    commercialSnapshot:commercial.snapshot,commercialSnapshotRequired:line.commercialSnapshotRequired,
    odometerTripEvidence,quantityEvidence,completionEvidence,
    operationalMetadata: metadata.snapshot,
    operationalRemarks: metadata.remarks,
    workDate,
    shift: request.shift,
    legacy: false,
    logs: [],
    totalOperatingMinutes: 0,
    totalIdleMinutes: 0,
    totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0,
    totalDemobilizationMinutes: 0,
    status: "Draft",
    billingLocked: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const persisted = deurRepository.create(record);
  return { success: true, record: persisted };
}

export function createManualDeur(request: CreateManualDeurRequest): CreateDeurResult {
  assertMutationPermission(request.authenticatedUser, "deur.create");
  if(!request.authenticatedUser&&import.meta.env.MODE==="test"&&!canCreateManualDeur(request.actor))return{success:false,message:"Actor is not authorized to create a Manual DEUR."};
  if(!request.actor.name.trim())return{success:false,message:"Encoded-by name is required."};
  if(!MANUAL_DEUR_REASONS.includes(request.manualMetadata?.reason))return{success:false,message:"Manual reason is required."};
  const reasonDetails=request.manualMetadata.reasonDetails?.trim();
  if(request.manualMetadata.reason==="OTHER"&&!reasonDetails)return{success:false,message:"Other manual reason details are required."};
  const physicalDeurReference=request.manualMetadata.physicalDeurReference?.trim();
  if(!physicalDeurReference)return{success:false,message:"Physical DEUR reference is required."};
  const duplicateReference=deurRepository.getAll().some(record=>record.manualMetadata?.physicalDeurReference.trim().toLocaleUpperCase()===physicalDeurReference.toLocaleUpperCase());
  if(duplicateReference)return{success:false,message:"This physical DEUR reference is already recorded."};
  const error=getDeurCreationError(request);if(error)return{success:false,message:error};
  if(!request.rental)return{success:false,message:"Rental operational metadata is required to create a DEUR."};
  const lineResolution=resolveDeurRentalEquipmentLine({rental:request.rental,rentalEquipmentLineId:request.rentalEquipmentLineId,equipmentId:request.equipmentId,assignmentId:request.assignmentId,operatorId:request.operatorId});if(!lineResolution.success)return{success:false,message:lineResolution.issue.message};const line=lineResolution.line;
  const commercial=line.commercialSnapshot?{success:true as const,snapshot:structuredClone(line.commercialSnapshot)}:createDeurCommercialSnapshot(request.rental);if(!commercial.success)return{success:false,message:commercial.message};
  const metadata=createDeurOperationalMetadataSnapshot({rental:{...request.rental,operationalMetadata:line.operationalMetadata??request.rental.operationalMetadata},selectedWorkDescription:request.selectedWorkDescription,remarks:request.remarks});
  if(!metadata.complete)return{success:false,message:metadata.issues[0].message};
  const billingMethod=commercial.snapshot?.billingMethod??request.billingMethod??request.rental.billingMethod;const resolved=resolveDeurEvidenceMode(billingMethod);if(!resolved.supported)return{success:false,message:"A supported Rental billing method is required."};
  const timeline=resolved.mode==="TIME_TIMELINE"?buildManualDeurTimeline({entries:request.timeline??[]}):undefined;if(timeline&&!timeline.success)return{success:false,message:timeline.issues[0]};
  const shiftStart=request.timeline?.[0]?.start;if(shiftStart&&calendarDateAt(shiftStart,request.rental.deurExpectationPolicy?.timezone)!==request.workDate)return{success:false,message:"DEUR work date must be the local date on which the shift starts."};
  const odometerTripEvidence=resolved.mode==="ODOMETER_TRIP"?normalizeOdometerTripEvidence({checkpoints:request.odometerCheckpoints}):undefined;if(resolved.mode==="ODOMETER_TRIP"&&!odometerTripEvidence)return{success:false,message:"Valid odometer checkpoints are required."};
  const quantityEvidence=resolved.mode==="QUANTITY"?normalizeQuantityEvidence(request.quantityEvidence):undefined;if(resolved.mode==="QUANTITY"&&!quantityEvidence)return{success:false,message:"Valid quantity evidence is required."};
  const completionEvidence=resolved.mode==="COMPLETION"?normalizeCompletionEvidence(request.completionEvidence):undefined;if(resolved.mode==="COMPLETION"&&!completionEvidence)return{success:false,message:"Valid completion evidence is required."};
  const timestamp=new Date().toISOString();
  const manualMetadata:ManualDeurMetadata={reason:request.manualMetadata.reason,...(reasonDetails?{reasonDetails}:{}),...(request.actor.id?.trim()?{encodedByUserId:request.actor.id.trim()}:{}),encodedByName:request.actor.name.trim(),encodedAt:timestamp,physicalDeurReference,sourceDocumentDate:request.manualMetadata.sourceDocumentDate?.trim()||request.workDate,operatorConfirmed:Boolean(request.manualMetadata.operatorConfirmed),...(request.manualMetadata.operatorConfirmedAt?.trim()?{operatorConfirmedAt:request.manualMetadata.operatorConfirmedAt.trim()}:{}),...(request.manualMetadata.operatorConfirmedByName?.trim()?{operatorConfirmedByName:request.manualMetadata.operatorConfirmedByName.trim()}:{}),...(request.manualMetadata.remarks?.trim()?{remarks:request.manualMetadata.remarks.trim()}:{}),};
  const totals=timeline?.success?timeline.totals:undefined;const record:DeurRecord={id:crypto.randomUUID(),rentalId:request.rentalId,rentalEquipmentLineId:line.id,assignmentId:line.assignmentId,equipmentId:line.equipmentId,operatorId:line.operatorId,projectId:request.projectId,customerId:request.customerId,creationSource:"RENTAL_COMPANY_MANUAL",manualMetadata,evidenceMode:resolved.mode,billingMethodSnapshot:String(billingMethod),commercialSnapshot:commercial.snapshot,commercialSnapshotRequired:line.commercialSnapshotRequired,odometerTripEvidence,quantityEvidence,completionEvidence,operationalMetadata:metadata.snapshot,operationalRemarks:metadata.remarks,workDate:request.workDate,reportDate:request.workDate,shift:request.shift,events:timeline?.success?timeline.events:[],totals,legacy:false,logs:[],totalOperatingMinutes:totals?.operationMinutes??0,totalIdleMinutes:totals?.idleMinutes??0,totalMaintenanceMinutes:totals?.breakdownMinutes??0,totalMealBreakMinutes:totals?.mealBreakMinutes??0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,status:"Draft",billingLocked:false,createdAt:timestamp,updatedAt:timestamp};
  return{success:true,record:deurRepository.create(record)};
}
