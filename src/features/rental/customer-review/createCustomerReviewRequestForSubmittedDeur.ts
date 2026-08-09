import { customerRepository } from "@/features/customer/repository";
import { equipmentRepository } from "@/features/equipment/repository";
import { operatorRepository } from "@/features/operators/repository";
import { projectRepository } from "@/features/project/repository";
import { rentalEquipmentLineRepository } from "@/features/rental/equipment-line/repository";
import { rentalRepository } from "@/features/rental/repository";
import type { DeurRecord } from "@/features/rental/deur/types";
import { developmentCustomerReviewOutbox } from "./developmentCustomerReviewOutbox";
import { reviewTimelineForDeur } from "./buildCustomerReviewSnapshot";

export function createCustomerReviewRequestForSubmittedDeur(deur: DeurRecord) {
  if (deur.status !== "Submitted") return { success: false as const, message: "Only a Submitted DEUR can create a Customer review request." };
  const rental = rentalRepository.getById(deur.rentalId);
  if (!rental) return { success: false as const, message: "Rental record is unavailable for Customer review." };
  const customer = rental.customerId ? customerRepository.getById(rental.customerId) : undefined;
  const contact = rental.customerContactSnapshot ?? (customer ? { representativeName: customer.contactPerson, representativeEmail: customer.email } : undefined);
  if (!contact?.representativeName?.trim() || !contact.representativeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.representativeEmail)) {
    return { success: false as const, message: "A valid Customer representative name and email are required." };
  }
  const line = deur.rentalEquipmentLineId ? rentalEquipmentLineRepository.getById(deur.rentalEquipmentLineId) : undefined;
  const equipment = equipmentRepository.getById(line?.equipmentId ?? deur.equipmentId);
  const operator = operatorRepository.getById(line?.operatorId ?? deur.operatorId);
  const projectId = deur.projectId ?? rental.projectId;
  const project = projectId ? projectRepository.getById(projectId) : undefined;
  const revisionNumber = deur.revision?.revisionNumber ?? 1;
  const existing = developmentCustomerReviewOutbox.getAll().find((item) => item.deurId === deur.id && item.revisionNumber === revisionNumber);
  if (existing) return { success: true as const, entry: existing, created: false };
  const entry = developmentCustomerReviewOutbox.create({
    deurId: deur.id,
    deurNumber: deur.deurNumber ?? "DEUR number unavailable",
    revisionNumber,
    rentalNumber: rental.rentalNumber ?? "Rental number unavailable",
    customerName: customer?.companyName ?? rental.customer,
    representativeName: contact.representativeName,
    representativeEmail: contact.representativeEmail,
    snapshot: {
      project: project?.projectName ?? rental.project,
      equipment: equipment ? `${equipment.equipmentName} (${equipment.assetNo})` : "Equipment record unavailable",
      operator: operator?.name ?? "Operator not assigned",
      workDate: deur.workDate,
      shift: deur.shift,
      workDescription: deur.operationalMetadata?.workDescription?.name,
      remarks: deur.operationalRemarks,
      submittedAt: deur.submittedAt,
      startedAt: deur.events?.find((event) => event.activityType === "shift" && event.action === "start")?.timestamp,
      completedAt: [...(deur.events ?? [])].reverse().find((event) => event.activityType === "shift" && event.action === "end")?.timestamp,
      openingMeter: deur.openingMeter,
      closingMeter: deur.closingMeter,
      operationMinutes: deur.totals?.operationMinutes ?? deur.totalOperatingMinutes,
      idleMinutes: deur.totals?.idleMinutes ?? deur.totalIdleMinutes,
      standbyMinutes: deur.totals?.mealBreakMinutes ?? deur.totalMealBreakMinutes,
      breakdownMinutes: deur.totals?.breakdownMinutes ?? deur.totalMaintenanceMinutes,
      origin: deur.creationSource ?? "Legacy",
      timeline: reviewTimelineForDeur(deur),
    },
  });
  return { success: true as const, entry, created: true };
}
