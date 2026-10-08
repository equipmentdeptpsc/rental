import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import { getProjectDisplayLabel } from "@/features/project/projectDisplay";
import type { CustomerRecord } from "@/features/customer/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";

export interface RentalListFilters {
  query: string;
  customer: string;
  project: string;
  equipment: string;
  operator: string;
  status: string;
  from: string;
  to: string;
}

export type RentalFilterOption = { value: string; label: string };
export const emptyRentalListFilters: RentalListFilters = { query: "", customer: "", project: "", equipment: "", operator: "", status: "", from: "", to: "" };

const legacyKey = (name: string) => `name:${name.trim().toLocaleLowerCase()}`;
export const rentalCustomerKey = (rental: RentalRecord) => rental.customerId || legacyKey(rental.customer);
export const rentalProjectKey = (rental: RentalRecord) => rental.projectId || legacyKey(rental.project);

export function rentalFilterOptions(input: {
  rentals: readonly RentalRecord[];
  lines: readonly RentalEquipmentLine[];
  equipment: readonly EquipmentRecord[];
  operators: readonly Operator[];
  projects: readonly ProjectRecord[];
  customers: readonly CustomerRecord[];
  customer?: string;
}) {
  const customerById = new Map(input.customers.map((item) => [item.id, item]));
  const projectById = new Map(input.projects.map((item) => [item.id, item]));
  const equipmentById = new Map(input.equipment.map((item) => [item.id, item]));
  const operatorById = new Map(input.operators.map((item) => [item.id, item]));
  const customers = new Map<string, string>();
  const projects = new Map<string, string>();
  const equipment = new Map<string, string>();
  const operators = new Map<string, string>();
  const statuses = new Map<string, string>();
  for (const rental of input.rentals) {
    customers.set(rentalCustomerKey(rental), customerById.get(rental.customerId ?? "")?.companyName || rental.customer);
    if (!input.customer || rentalCustomerKey(rental) === input.customer) {
      const project = projectById.get(rental.projectId ?? "");
      if (!input.customer || !project?.customerId || project.customerId === input.customer || input.customer.startsWith("name:")) {
        projects.set(rentalProjectKey(rental), project ? getProjectDisplayLabel(project) : rental.project);
      }
    }
    statuses.set(rental.status, rental.status);
  }
  for (const line of input.lines) {
    const item = equipmentById.get(line.equipmentId);
    if (item) equipment.set(item.id, `${item.assetNo} - ${item.equipmentName}`);
    const operator = operatorById.get(line.operatorId);
    if (operator) operators.set(operator.id, operator.name);
  }
  for (const rental of input.rentals) {
    const item = equipmentById.get(rental.equipmentId);
    if (item) equipment.set(item.id, `${item.assetNo} - ${item.equipmentName}`);
    const operator = operatorById.get(rental.operatorId ?? "");
    if (operator) operators.set(operator.id, operator.name);
  }
  const options = (map: Map<string, string>): RentalFilterOption[] => [...map].filter(([, label]) => label.trim()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  return { customers: options(customers), projects: options(projects), equipment: options(equipment), operators: options(operators), statuses: options(statuses) };
}

export function filterRentalList(input: {
  rentals: readonly RentalRecord[];
  lines: readonly RentalEquipmentLine[];
  equipment: readonly EquipmentRecord[];
  operators: readonly Operator[];
  projects?: readonly ProjectRecord[];
  filters?: RentalListFilters;
  query?: string;
}): RentalRecord[] {
  const filters = input.filters ?? { ...emptyRentalListFilters, query: input.query ?? "" };
  const query = filters.query.trim().toLocaleLowerCase();
  const equipmentById = new Map(input.equipment.map((item) => [item.id, item]));
  const operatorById = new Map(input.operators.map((item) => [item.id, item]));
  const projectById = new Map((input.projects ?? []).map((item) => [item.id, item]));
  const linesByRental = new Map<string, RentalEquipmentLine[]>();
  for (const line of input.lines) {
    const lines = linesByRental.get(line.rentalId) ?? [];
    lines.push(line);
    linesByRental.set(line.rentalId, lines);
  }
  return input.rentals.filter((rental) => {
    if (filters.customer && rentalCustomerKey(rental) !== filters.customer) return false;
    if (filters.project && rentalProjectKey(rental) !== filters.project) return false;
    if (filters.status && rental.status !== filters.status) return false;
    if (filters.from && rental.dateOut.slice(0, 10) < filters.from) return false;
    if (filters.to && rental.dateOut.slice(0, 10) > filters.to) return false;
    const lines = linesByRental.get(rental.id) ?? [];
    const equipmentIds = [rental.equipmentId, ...lines.map((line) => line.equipmentId)];
    const operatorIds = [rental.operatorId, ...lines.map((line) => line.operatorId)];
    if (filters.equipment && !equipmentIds.includes(filters.equipment)) return false;
    if (filters.operator && !operatorIds.includes(filters.operator)) return false;
    if (!query) return true;
    const project = projectById.get(rental.projectId ?? "");
    const search = [rental.rentalNumber, rental.customer, rental.project, project?.projectCode, project?.projectName, project?.location, rental.remarks, rental.operationalMetadata?.activityCode?.code, rental.operationalMetadata?.activityCode?.name,
      ...lines.flatMap((line) => [line.deurExpectationSnapshot?.workDescription?.name, line.deurOperationalRemarks]),
      ...equipmentIds.flatMap((id) => { const item = equipmentById.get(id); return item ? [item.assetNo, item.equipmentName, item.category, item.location] : []; }),
      ...operatorIds.map((id) => operatorById.get(id ?? "")?.name),
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return search.includes(query);
  });
}
