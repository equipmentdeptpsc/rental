import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { EquipmentMaintenanceSnapshot } from "@/features/maintenance/canonical";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { CanonicalEquipmentProjection } from "./useCanonicalEquipmentData";

export type DetailSection<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error" };

export interface RecentDeurActivityRecord {
  record: DeurRecord;
  operatorName?: string;
  projectName?: string;
}

export interface CanonicalEquipmentDetail {
  equipment: DetailSection<CanonicalEquipmentProjection | null>;
  assignment: DetailSection<{ assignment?: AssignmentRecord; project?: ProjectRecord; operator?: Operator; projectReadable: boolean; operatorReadable: boolean }>;
  rental: DetailSection<{ line?: RentalEquipmentLine; rental?: RentalRecord; customer?: CustomerRecord; customerReadable: boolean }>;
  maintenance: DetailSection<EquipmentMaintenanceSnapshot>;
  recentDeurs: DetailSection<RecentDeurActivityRecord[]>;
  retry: () => void;
}

const currentRentalStatuses = new Set<RentalRecord["status"]>(["Draft", "Assigned", "Reserved", "Released", "Active"]);
const currentLineStatuses = new Set<RentalEquipmentLine["status"]>(["Draft", "Assigned", "Reserved", "Released", "Active"]);
export function selectCurrentRental(lines: readonly RentalEquipmentLine[], rentals: readonly RentalRecord[]) {
  const activeLines = lines.filter((line) => currentLineStatuses.has(line.status) && !(line as RentalEquipmentLine & { deleted?: boolean; deletedAt?: unknown }).deleted && !(line as RentalEquipmentLine & { deletedAt?: unknown }).deletedAt);
  const activeRentals = rentals.filter((rental) => currentRentalStatuses.has(rental.status));
  const pairs = activeRentals.flatMap((rental) => activeLines.filter((line) => line.rentalId === rental.id).map((line) => ({ line, rental })));
  return pairs.sort((a, b) => {
    const lineOrder = (b.line.updatedAt ?? "").localeCompare(a.line.updatedAt ?? "") || (b.line.createdAt ?? "").localeCompare(a.line.createdAt ?? "");
    return lineOrder || (b.rental.createdAt ?? "").localeCompare(a.rental.createdAt ?? "") || b.line.id.localeCompare(a.line.id);
  })[0];
}

export function useCanonicalEquipmentDetail(id: string | undefined): CanonicalEquipmentDetail {
  const { readRepositories, repositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const canReadAssignments = hasPermission("assignment.read");
  const canReadProjects = hasPermission("project.read");
  const canReadOperators = hasPermission("operator.read");
  const canReadRentals = hasPermission("rental.read");
  const canReadCustomers = hasPermission("customer.read");
  const canReadMaintenance = hasPermission("maintenance.read");
  const [attempt, setAttempt] = useState(0);
  const [equipment, setEquipment] = useState<DetailSection<CanonicalEquipmentProjection | null>>({ status: "loading" });
  const [assignment, setAssignment] = useState<CanonicalEquipmentDetail["assignment"]>({ status: "loading" });
  const [rental, setRental] = useState<CanonicalEquipmentDetail["rental"]>({ status: "loading" });
  const [maintenance, setMaintenance] = useState<CanonicalEquipmentDetail["maintenance"]>({ status: "loading" });
  const [recentDeurs, setRecentDeurs] = useState<CanonicalEquipmentDetail["recentDeurs"]>({ status: "loading" });

  useEffect(() => {
    let active = true;
    if (!id) { setEquipment({ status: "ready", value: null }); return () => { active = false; }; }
    setEquipment({ status: "loading" });
    void Promise.all([Promise.resolve(readRepositories.equipment.getById(id)), repositories.equipmentStatusRead.list(), Promise.resolve(readRepositories.equipmentCategories.list())]).then(([result, statuses, categories]) => {
      if (!active) return;
      if (!result.success || !statuses.success || !categories.success) { setEquipment({ status: "error" }); return; }
      if (!result.value || result.value.deleted) { setEquipment({ status: "ready", value: null }); return; }
      const row = result.value as unknown as Record<string, unknown>;
      const text = (value: unknown) => typeof value === "string" ? value : undefined;
      const statusId = text(row.statusId);
      const categoryId = text(row.categoryId);
      const status = statuses.value.find((item) => item.id === statusId && item.active && !item.deleted);
      const category = categories.value.items.find((item) => item.id === categoryId && item.active);
      setEquipment({ status: "ready", value: { id: result.value.id, assetNo: result.value.assetNo, equipmentName: result.value.equipmentName, statusId, statusLabel: status?.status, active: result.value.active !== false, deleted: Boolean(row.deleted) || row.deletedAt != null, categoryId, category: category?.name ?? text(row.category), subcategoryId: text(row.subcategoryId), subcategoryName: text(row.subcategoryName), subcategoryActive: typeof row.subcategoryActive === "boolean" ? row.subcategoryActive : undefined, projectId: text(row.projectId), customerId: text(row.customerId), type: text(row.type), manufacturer: text(row.manufacturer), model: text(row.modelText) ?? text(row.model), serialNumber: text(row.serialNumber), maintenanceType: text(row.maintenanceType), currentReading: typeof row.currentReading === "number" ? row.currentReading : undefined, engineNumber: text(row.engineNumber), chassisNumber: text(row.chassisNumber), plateNumber: text(row.plateNumber), yearModel: typeof row.yearModel === "number" ? row.yearModel : undefined, capacity: text(row.capacity) } });
    }).catch(() => { if (active) setEquipment({ status: "error" }); });
    return () => { active = false; };
  }, [attempt, id, readRepositories.equipment, readRepositories.equipmentCategories, repositories.equipmentStatusRead]);

  useEffect(() => {
    let active = true;
    if (!id || !canReadAssignments) { setAssignment({ status: "ready", value: { projectReadable: canReadProjects, operatorReadable: canReadOperators } }); return () => { active = false; }; }
    setAssignment({ status: "loading" });
    void Promise.resolve(readRepositories.assignments.list({ filters: { equipment_id: id } })).then(async (result) => {
      if (!active) return;
      if (!result.success) { setAssignment({ status: "error" }); return; }
      const current = result.value.items.filter((item) => item.status === "Active" && !item.deleted && item.deletedAt == null).sort((a, b) => b.assignedDate.localeCompare(a.assignedDate) || b.id.localeCompare(a.id))[0];
      const [projectResult, operatorResult] = await Promise.all([
        current && canReadProjects ? readRepositories.projects.getById(current.projectId) : Promise.resolve(undefined),
        current && canReadOperators ? readRepositories.operators.getById(current.operatorId) : Promise.resolve(undefined),
      ]);
      if (!active) return;
      setAssignment({ status: "ready", value: { assignment: current, project: projectResult?.success ? projectResult.value ?? undefined : undefined, operator: operatorResult?.success ? operatorResult.value ?? undefined : undefined, projectReadable: canReadProjects, operatorReadable: canReadOperators } });
    }).catch(() => { if (active) setAssignment({ status: "error" }); });
    return () => { active = false; };
  }, [attempt, canReadAssignments, canReadOperators, canReadProjects, id, readRepositories.assignments, readRepositories.operators, readRepositories.projects]);

  useEffect(() => {
    let active = true;
    if (!id || !canReadRentals) { setRental({ status: "ready", value: { customerReadable: canReadCustomers } }); return () => { active = false; }; }
    setRental({ status: "loading" });
    void Promise.resolve(readRepositories.rentalEquipmentLines.list({ filters: { equipment_id: id } })).then(async (linesResult) => {
      if (!active) return;
      if (!linesResult.success) { setRental({ status: "error" }); return; }
      const lines = linesResult.value.items;
      const rentals = (await Promise.all([...new Set(lines.map((line) => line.rentalId))].map((rentalId) => readRepositories.rentals.getById(rentalId)))).flatMap((result) => result?.success && result.value ? [result.value] : []);
      if (!active) return;
      const selected = selectCurrentRental(lines, rentals);
      const selectedRental = selected?.rental;
      const selectedLine = selected?.line;
      const customerResult = selectedRental?.customerId && canReadCustomers ? await readRepositories.customers.getById(selectedRental.customerId) : undefined;
      if (!active) return;
      setRental({ status: "ready", value: { line: selectedLine, rental: selectedRental, customer: customerResult?.success ? customerResult.value ?? undefined : undefined, customerReadable: canReadCustomers } });
    }).catch(() => { if (active) setRental({ status: "error" }); });
    return () => { active = false; };
  }, [attempt, canReadCustomers, canReadRentals, id, readRepositories.customers, readRepositories.rentalEquipmentLines, readRepositories.rentals]);

  useEffect(() => {
    let active = true;
    if (!id || !canReadMaintenance) { setMaintenance({ status: "ready", value: { openRecords: [] } }); return () => { active = false; }; }
    setMaintenance({ status: "loading" });
    void readRepositories.maintenance.getEquipmentMaintenanceSnapshot(id).then((result) => {
      if (!active) return;
      setMaintenance(result.success ? { status: "ready", value: result.value } : { status: "error" });
    }).catch(() => { if (active) setMaintenance({ status: "error" }); });
    return () => { active = false; };
  }, [attempt, canReadMaintenance, id, readRepositories.maintenance]);

  useEffect(() => {
    let active = true;
    if (!id || !hasPermission("deur.read")) { setRecentDeurs({ status: "ready", value: [] }); return () => { active = false; }; }
    setRecentDeurs({ status: "loading" });
    void readRepositories.deurs.list({ filters: { equipment_id: id }, ordering: [{ field: "work_date", ascending: false }, { field: "created_at", ascending: false }], paging: { limit: 5 } }).then(async (result) => {
      if (!active) return;
      if (!result.success) { setRecentDeurs({ status: "error" }); return; }
      const operatorIds = canReadOperators ? [...new Set(result.value.items.map((item) => item.operatorId).filter(Boolean))] : [];
      const projectIds = canReadProjects ? [...new Set(result.value.items.map((item) => item.projectId).filter((value): value is string => Boolean(value)))] : [];
      const [operators, projects] = await Promise.all([
        Promise.all(operatorIds.map((operatorId) => readRepositories.operators.getById(operatorId))),
        Promise.all(projectIds.map((projectId) => readRepositories.projects.getById(projectId))),
      ]);
      if (!active) return;
      const operatorNames = new Map(operators.flatMap((value) => value?.success && value.value ? [[value.value.id, value.value.name] as const] : []));
      const projectNames = new Map(projects.flatMap((value) => value?.success && value.value ? [[value.value.id, value.value.projectName] as const] : []));
      setRecentDeurs({ status: "ready", value: result.value.items.map((record) => ({ record, operatorName: canReadOperators ? operatorNames.get(record.operatorId) : undefined, projectName: record.projectId && canReadProjects ? projectNames.get(record.projectId) : undefined })) });
    }).catch(() => { if (active) setRecentDeurs({ status: "error" }); });
    return () => { active = false; };
  }, [attempt, canReadOperators, canReadProjects, hasPermission, id, readRepositories.deurs, readRepositories.operators, readRepositories.projects]);

  return { equipment, assignment, rental, maintenance, recentDeurs, retry: () => setAttempt((value) => value + 1) };
}
