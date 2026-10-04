import type { ApplicationDependencies } from "@/app/composition";
import type { ReadOnlyRepository } from "@/core/remote";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { CanonicalAuditEvent } from "@/features/administration/domain/canonicalAudit";
import type { EquipmentStatusRecord } from "@/features/masters/equipment-status/types";
import { calculateDashboardSummary } from "./dashboard.service";
import { calculateBusinessDashboardSummary } from "./businessDashboardSummary";
import { calculateFleetUtilization } from "./fleetUtilization";
import { buildDashboardActionQueue } from "./dashboardActionQueue";

const PAGE_SIZE = 200;
const MAX_PAGES = 100;

/** Explicit pages avoid PostgREST's implicit row cap. An incomplete read is an error, never a count. */
export async function readAllCanonicalPages<T extends { id: string }>(repository: ReadOnlyRepository<T>, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  const ids = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await repository.list({ paging: { offset: items.length, limit: PAGE_SIZE }, ordering: [{ field: "id", ascending: true }], signal });
    if (!result.success) throw new Error(result.error.message);
    if (result.value.items.length > PAGE_SIZE) throw new Error("Canonical reader returned an oversized page.");
    if (result.value.items.length === 0) return items;
    for (const item of result.value.items) {
      if (ids.has(item.id)) throw new Error("Canonical pages changed during the Dashboard read. Refresh and retry.");
      ids.add(item.id);
    }
    items.push(...result.value.items);
  }
  throw new Error("Canonical read exceeded the verified dashboard page limit.");
}

async function readAllStatuses(repository: ApplicationDependencies["repositories"]["equipmentStatusRead"], signal?: AbortSignal) {
  const items: EquipmentStatusRecord[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await repository.list({ paging: { offset: items.length, limit: PAGE_SIZE }, signal });
    if (!result.success) throw new Error(result.error.message);
    if (result.value.length > PAGE_SIZE) throw new Error("Equipment status reader returned an oversized page.");
    if (result.value.length === 0) return items;
    items.push(...result.value);
  }
  throw new Error("Equipment status read exceeded the verified dashboard page limit.");
}

export interface CanonicalDashboardModel {
  operational: ReturnType<typeof calculateDashboardSummary>;
  financial: ReturnType<typeof calculateBusinessDashboardSummary>;
  fleetUtilization: ReturnType<typeof calculateFleetUtilization>;
  utilizationRate: number;
  pendingDeur: number;
  actionQueue: ReturnType<typeof buildDashboardActionQueue>;
  activity: { id: string; title: string; description: string; timestamp: string; kind: "rental" | "equipment" }[];
  recentEquipmentActivity: [];
  activityAvailable: boolean;
}

/** Metric sources: fleet = equipment_read_model + equipment_statuses; Assignments = assignments;
 * Active Rentals/upcoming = rentals; Pending DEUR/acknowledgements = effective deurs.
 * Rental-backed Bookings and Rental lines are deliberately not counted as Rentals.
 * Maintenance is an Equipment status here, not a count of maintenance records.
 */
export async function readCanonicalDashboard(
  dependencies: Pick<ApplicationDependencies, "readRepositories" | "repositories">,
  options: { canReadAudit: boolean; signal?: AbortSignal },
): Promise<CanonicalDashboardModel> {
  const { readRepositories, repositories } = dependencies;
  const [rawEquipment, statuses, assignments, rentals, deurs, audit] = await Promise.all([
    readAllCanonicalPages(readRepositories.equipment, options.signal),
    readAllStatuses(repositories.equipmentStatusRead, options.signal),
    readAllCanonicalPages(readRepositories.assignments, options.signal),
    readAllCanonicalPages(readRepositories.rentals, options.signal),
    readAllCanonicalPages(readRepositories.deurs, options.signal),
    options.canReadAudit
      ? readRepositories.canonicalAudit.list({ paging: { offset: 0, limit: 8 }, ordering: [{ field: "occurred_at", ascending: false }], signal: options.signal })
      : Promise.resolve(undefined),
  ]);
  if (audit && !audit.success) throw new Error(audit.error.message);

  const labels = new Map(statuses.filter((status) => status.active && !status.deleted).map((status) => [status.id, status.status]));
  const equipment = rawEquipment.map((record) => {
    const row = record as EquipmentRecord & { statusId?: string; deletedAt?: string | null };
    const status = row.statusId ? labels.get(row.statusId) : undefined;
    if (row.active !== false && !row.deletedAt && !status) throw new Error("Canonical Equipment status could not be resolved.");
    return { ...record, status: status ?? "Unavailable", deleted: Boolean(row.deletedAt) } as EquipmentRecord;
  });
  const currentEquipment = equipment.filter((record) => record.active !== false && !record.deleted);
  const currentAssignments = assignments.filter((record) => !record.deletedAt);
  const currentRentals = rentals.filter((record) => !(record as unknown as { deletedAt?: unknown }).deletedAt);
  const currentDeurs = deurs.filter((record) => !(record as unknown as { deletedAt?: unknown }).deletedAt && !record.revision?.supersededByRevisionId);
  const operational = calculateDashboardSummary(currentEquipment, currentAssignments, currentRentals, []);
  const financial = calculateBusinessDashboardSummary({ statements: [], collections: [], rentals: currentRentals, deurs: currentDeurs });
  const fleetUtilization = calculateFleetUtilization(currentEquipment);
  const pendingDeur = currentDeurs.filter((record) => ["Draft", "In Progress", "Submitted", "Pending Acknowledgement"].includes(record.status)).length;
  const activity = (audit?.success ? audit.value.items : []).map((event: CanonicalAuditEvent) => ({
    id: event.id, title: event.action.replaceAll("_", " ").toLowerCase(), description: `${event.aggregateType} ${event.aggregateId}`,
    timestamp: event.occurredAt, kind: event.aggregateType === "Rental" ? "rental" as const : "equipment" as const,
  }));
  return {
    operational, financial, fleetUtilization, utilizationRate: fleetUtilization.rate, pendingDeur,
    actionQueue: buildDashboardActionQueue({ deurs: currentDeurs, rentals: currentRentals, ...financial.upcoming }),
    activity, recentEquipmentActivity: [], activityAvailable: options.canReadAudit,
  };
}
