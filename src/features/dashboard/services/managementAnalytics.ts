import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import { getProjectDisplayLabel } from "@/features/project/projectDisplay";
import type { ProjectRecord } from "@/features/project/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";
import type { CollectionTransaction } from "@/features/rental/collections/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import { calculateFleetUtilization } from "./fleetUtilization";
import { comparePeriodValues, comparisonPeriod, rangeDays, withinRange, type DashboardComparison, type DashboardDateRange } from "./managementPeriods";

export interface DashboardManagementSource {
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  rentals: RentalRecord[];
  rentalLines: RentalEquipmentLine[];
  projects: ProjectRecord[];
  deurs: DeurRecord[];
  statements: BillingStatement[];
  collections: CollectionTransaction[];
}

export interface RankedAmount { key: string; label: string; amount: number; href: string }
export interface AttentionItem { key: string; severity: "high" | "medium" | "info"; equipment: string; issue: string; context: string; href: string }

const amount = (statement: BillingStatement) => Math.max(0, statement.grandTotal ?? statement.subtotal);
const invoiced = (statement: BillingStatement) => !["Cancelled", "Not Invoiced"].includes(statement.invoiceStatus);
const equipmentLabel = (item: EquipmentRecord | undefined) => item ? `${item.assetNo} - ${item.equipmentName}` : "Equipment unavailable";
const rank = (values: Map<string, RankedAmount>, limit = 5) => [...values.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label) || a.key.localeCompare(b.key)).slice(0, limit);
const addAmount = (values: Map<string, RankedAmount>, item: RankedAmount) => values.set(item.key, { ...item, amount: (values.get(item.key)?.amount ?? 0) + item.amount });
const dateMs = (value: string) => Date.parse(`${value.slice(0, 10)}T12:00:00Z`);
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function trendBucket(value: string, period: DashboardDateRange) {
  const date = value.slice(0, 10);
  const days = rangeDays(period);
  if (days <= 45) return date;
  if (days > 180) return date.slice(0, 7);
  const index = Math.floor((dateMs(date) - dateMs(period.from)) / 86_400_000 / 7);
  return new Date(dateMs(period.from) + index * 7 * 86_400_000).toISOString().slice(0, 10);
}

function deploymentDays(source: DashboardManagementSource, period: DashboardDateRange, now: Date) {
  const intervals = new Map<string, Array<[string, string]>>();
  const today = day(now);
  const add = (id: string, start?: string, end?: string) => {
    if (!id || !start || !end || start.slice(0, 10) > end.slice(0, 10)) return;
    const values = intervals.get(id) ?? [];
    values.push([start.slice(0, 10), end.slice(0, 10)]);
    intervals.set(id, values);
  };
  for (const assignment of source.assignments) {
    if (assignment.deleted || assignment.deletedAt || assignment.status === "Cancelled") continue;
    const end = assignment.status === "Active" ? today : assignment.returnedDate;
    add(assignment.equipmentId, assignment.startDate || assignment.assignedDate, end);
  }
  const rentals = new Map(source.rentals.map((rental) => [rental.id, rental]));
  for (const line of source.rentalLines) {
    const rental = rentals.get(line.rentalId);
    if (!rental || ["Draft", "Assigned", "Reserved", "Cancelled"].includes(rental.status) || line.status === "Cancelled" || line.status === "Reserved") continue;
    const end = ["Returned", "Closed"].includes(line.status) ? line.actualReturnDate || rental.actualReturn : today;
    add(line.equipmentId, line.effectiveStartDate || rental.releasedAt || rental.dateOut, end);
  }
  const result = new Map<string, number>();
  for (const [id, ranges] of intervals) {
    const days = new Set<string>();
    for (const [start, end] of ranges) {
      const first = Math.max(dateMs(start), dateMs(period.from));
      const last = Math.min(dateMs(end), dateMs(period.to), dateMs(today));
      for (let time = first; time <= last; time += 86_400_000) days.add(new Date(time).toISOString().slice(0, 10));
    }
    if (days.size) result.set(id, days.size);
  }
  return result;
}

export function buildManagementAnalytics(source: DashboardManagementSource, period: DashboardDateRange, comparison: DashboardComparison, now = new Date()) {
  const previous = comparisonPeriod(period, comparison);
  const activeEquipment = source.equipment.filter((item) => item.active !== false && !item.deleted && !item.deletedAt);
  const equipmentById = new Map(activeEquipment.map((item) => [item.id, item]));
  const rentalsById = new Map(source.rentals.map((item) => [item.id, item]));
  const linesByRental = new Map<string, RentalEquipmentLine[]>();
  for (const line of source.rentalLines) { const lines = linesByRental.get(line.rentalId) ?? []; lines.push(line); linesByRental.set(line.rentalId, lines); }
  const projectsById = new Map(source.projects.map((item) => [item.id, item]));
  const statements = source.statements.filter(invoiced);
  const statementById = new Map(statements.map((item) => [item.id, item]));
  const validCollections = source.collections.filter((item) => {
    const statement = statementById.get(item.statementId);
    return statement?.rentalId === item.rentalId && Number.isFinite(item.amount) && item.amount > 0;
  });
  const periodStatements = statements.filter((item) => withinRange(item.billingTo, period));
  const previousStatements = statements.filter((item) => withinRange(item.billingTo, previous));
  const periodCollections = validCollections.filter((item) => withinRange(item.paymentDate, period));
  const previousCollections = validCollections.filter((item) => withinRange(item.paymentDate, previous));
  const revenue = periodStatements.reduce((sum, item) => sum + amount(item), 0);
  const priorRevenue = previousStatements.reduce((sum, item) => sum + amount(item), 0);
  const collections = periodCollections.reduce((sum, item) => sum + item.amount, 0);
  const priorCollections = previousCollections.reduce((sum, item) => sum + item.amount, 0);
  const outstanding = statements.reduce((sum, item) => sum + reconcileStatementCollections(item, validCollections).outstandingBalance, 0);
  const fleet = calculateFleetUtilization(activeEquipment);
  const trend = new Map<string, { label: string; revenue: number; collections: number }>();
  const bucket = (date: string) => { const label = trendBucket(date, period); const row = trend.get(label) ?? { label, revenue: 0, collections: 0 }; trend.set(label, row); return row; };
  for (let cursor = dateMs(period.from); cursor <= dateMs(period.to); cursor += 86_400_000) bucket(new Date(cursor).toISOString().slice(0, 10));
  periodStatements.forEach((item) => { bucket(item.billingTo).revenue += amount(item); });
  periodCollections.forEach((item) => { bucket(item.paymentDate).collections += item.amount; });

  const customerValues = new Map<string, RankedAmount>(), projectValues = new Map<string, RankedAmount>(), equipmentValues = new Map<string, RankedAmount>();
  let equipmentAttributionComplete = true;
  for (const statement of periodStatements) {
    const rental = rentalsById.get(statement.rentalId);
    const customer = rental?.customer || statement.customer || "Customer unavailable";
    const customerKey = rental?.customerId || customer.toLocaleLowerCase();
    addAmount(customerValues, { key: customerKey, label: customer, amount: amount(statement), href: `/rentals?r_customer=${encodeURIComponent(customerKey)}` });
    const project = rental?.project || statement.project || "Project unavailable";
    const projectKey = rental?.projectId || project.toLocaleLowerCase();
    const projectLabel = rental?.projectId && projectsById.has(rental.projectId) ? getProjectDisplayLabel(projectsById.get(rental.projectId)) : project;
    addAmount(projectValues, { key: projectKey, label: projectLabel, amount: amount(statement), href: `/rentals?r_project=${encodeURIComponent(projectKey)}` });
    const lines = statement.lines;
    const lineSum = lines.reduce((sum, line) => sum + (line.grandTotal ?? line.amount), 0);
    if (!lines.length || lines.some((line) => !line.equipmentId && !line.equipmentSnapshot?.id) || !Number.isFinite(lineSum) || Math.abs(lineSum - amount(statement)) > 0.02) { equipmentAttributionComplete = false; continue; }
    for (const line of lines) {
      const id = line.equipmentId || line.equipmentSnapshot!.id;
      const record = equipmentById.get(id);
      const label = record ? equipmentLabel(record) : line.equipmentSnapshot?.assetNo && line.equipmentSnapshot.name ? `${line.equipmentSnapshot.assetNo} - ${line.equipmentSnapshot.name}` : undefined;
      if (!label) { equipmentAttributionComplete = false; break; }
      addAmount(equipmentValues, { key: id, label, amount: line.grandTotal ?? line.amount, href: `/equipment/${encodeURIComponent(id)}` });
    }
  }

  const idleMinutes = new Map<string, { operation: number; idle: number }>();
  for (const deur of source.deurs) {
    if (deur.revision?.supersededByRevisionId || !["Acknowledged", "Billed"].includes(deur.status) || !withinRange(deur.workDate, period)) continue;
    const operation = deur.totals?.operationMinutes ?? deur.totalOperatingMinutes;
    const idle = deur.totals?.idleMinutes ?? deur.totalIdleMinutes;
    if (!Number.isFinite(operation) || !Number.isFinite(idle) || operation < 0 || idle < 0) continue;
    const current = idleMinutes.get(deur.equipmentId) ?? { operation: 0, idle: 0 };
    current.operation += operation; current.idle += idle;
    idleMinutes.set(deur.equipmentId, current);
  }
  const idle = [...idleMinutes].map(([id, values]) => ({ id, label: equipmentLabel(equipmentById.get(id)), operationHours: values.operation / 60, idleHours: values.idle / 60, percent: values.operation + values.idle ? values.idle / (values.operation + values.idle) * 100 : 0, href: `/equipment/${encodeURIComponent(id)}` })).filter((item) => item.percent >= 40 && item.label !== "Equipment unavailable").sort((a, b) => b.percent - a.percent || b.idleHours - a.idleHours || a.label.localeCompare(b.label)).slice(0, 5);
  const deployment = deploymentDays(source, period, now);
  const observedDays = Math.max(1, Math.min(rangeDays(period), Math.floor((dateMs(day(now)) - dateMs(period.from)) / 86_400_000) + 1));
  const utilized = [...deployment].map(([id, days]) => ({ id, label: equipmentLabel(equipmentById.get(id)), days, percent: days / observedDays * 100, href: `/equipment/${encodeURIComponent(id)}` })).filter((item) => item.label !== "Equipment unavailable").sort((a, b) => b.days - a.days || a.label.localeCompare(b.label)).slice(0, 5);
  const today = day(now);
  const attention: AttentionItem[] = [];
  for (const rental of source.rentals) {
    if (!["Released", "Active"].includes(rental.status) || !rental.expectedReturn || rental.expectedReturn.slice(0, 10) >= today) continue;
    const related = (linesByRental.get(rental.id) ?? []).filter((line) => !["Returned", "Closed", "Cancelled"].includes(line.status));
    const ids = related.length ? related.map((line) => line.equipmentId) : [rental.equipmentId];
    for (const id of new Set(ids)) attention.push({ key: `return:${rental.id}:${id}`, severity: "high", equipment: equipmentLabel(equipmentById.get(id)), issue: "Return overdue", context: `${rental.rentalNumber ?? "Rental"} · expected ${rental.expectedReturn.slice(0, 10)}`, href: `/rentals/${encodeURIComponent(rental.id)}/workspace` });
  }
  for (const line of source.rentalLines) {
    if (line.operatorId || !["Released", "Active"].includes(line.status)) continue;
    const rental = rentalsById.get(line.rentalId);
    if (!rental || !["Released", "Active"].includes(rental.status)) continue;
    attention.push({ key: `operator:${line.id}`, severity: "medium", equipment: equipmentLabel(equipmentById.get(line.equipmentId)), issue: "Operator not assigned", context: rental.rentalNumber ?? "Active rental", href: `/rentals/${encodeURIComponent(rental.id)}/workspace` });
  }
  for (const item of idle) attention.push({ key: `idle:${item.id}`, severity: "medium", equipment: item.label, issue: "High measured idle share", context: `${item.percent.toFixed(1)}% idle · ${item.idleHours.toFixed(1)} h`, href: item.href });
  attention.sort((a, b) => ({ high: 0, medium: 1, info: 2 })[a.severity] - ({ high: 0, medium: 1, info: 2 })[b.severity] || a.equipment.localeCompare(b.equipment));

  return {
    period, previous, fleet, activeRentals: source.rentals.filter((item) => item.status === "Active").length,
    revenue, collections, outstanding, revenueChange: comparePeriodValues(revenue, priorRevenue), collectionsChange: comparePeriodValues(collections, priorCollections),
    collectionRealization: revenue > 0 ? collections / revenue * 100 : null,
    trend: [...trend.values()].sort((a, b) => a.label.localeCompare(b.label)),
    topCustomers: rank(customerValues), topProjects: rank(projectValues), topRevenueEquipment: equipmentAttributionComplete ? rank(equipmentValues) : [], equipmentAttributionComplete,
    topUtilizedEquipment: utilized, idleHeavyEquipment: idle, attention: attention.slice(0, 10),
    pipeline: ["Draft", "Reserved", "Released", "Active", "Returned"].map((status) => ({ status, count: source.rentals.filter((rental) => rental.status === status).length })),
  };
}
