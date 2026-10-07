import type { ApplicationDependencies } from "@/app/composition";
import { readAllCanonicalPages } from "@/features/dashboard/services/canonicalDashboardRead";
import { canonicalMeterEvidence, deurShiftDistanceKilometers } from "@/features/rental/deur/services/canonicalMeterEvidence";
import { calculateShiftHourMeterSeconds } from "@/features/rental/deur/services/calculateShiftHourMeter";
import { resolveEffectiveDeurRevision } from "@/features/rental/deur/services/correction/resolveEffectiveDeurRevision";
import type { DeurRecord } from "@/features/rental/deur/types";

export interface RemoteDailyLogRow {
  id: string;
  workDate: string;
  deurNumber: string;
  equipment: string;
  operator: string;
  project: string;
  rental: string;
  rentalId: string;
  rentalEquipmentLine: string;
  shift: string;
  status: DeurRecord["status"];
  revision: string;
  activity: string;
  meter: string;
  searchText: string;
}

export interface RemoteDailyLogsModel {
  rows: RemoteDailyLogRow[];
  total: number;
  today: number;
  equipmentLogged: number;
  awaitingReview: number;
}

function currentEffectiveDeurs(records: DeurRecord[]): DeurRecord[] {
  const chains = new Map<string, DeurRecord[]>();
  for (const record of records) {
    const state = record as DeurRecord & { deleted?: boolean; deletedAt?: string | null };
    if (state.deleted || state.deletedAt) continue;
    const chainId = record.revision?.chainId ?? record.id;
    chains.set(chainId, [...(chains.get(chainId) ?? []), record]);
  }
  return [...chains.values()].map((members) => {
    const resolution = resolveEffectiveDeurRevision(members);
    if (!resolution.valid) throw new Error(`Daily Log revision data is inconsistent. ${resolution.issues[0]?.message ?? "Refresh and retry."}`);
    const current = resolution.currentEffective ?? resolution.ordered.find((item) => item.status === "Billed" && !item.revision?.supersededByRevisionId);
    if (current) return current;
    const remaining = resolution.ordered.filter((item) => !item.revision?.supersededByRevisionId);
    const latest = remaining.at(-1);
    if (!latest) throw new Error("Daily Log revision data has no current record.");
    return latest;
  });
}

function duration(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes)) return "—";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours}h${remaining ? ` ${remaining}m` : ""}` : `${minutes}m`;
}

function activitySummary(deur: DeurRecord): string {
  const operation = deur.totals?.operationMinutes ?? deur.totalOperatingMinutes;
  const idle = deur.totals?.idleMinutes ?? deur.totalIdleMinutes;
  const standby = deur.totals?.standbyMinutes ?? deur.totalStandbyMinutes;
  const breakdown = deur.totals?.breakdownMinutes ?? deur.totalMaintenanceMinutes;
  const maintenanceLabel = deur.totals?.breakdownMinutes === undefined ? "Maintenance" : "Breakdown";
  return [`Operation ${duration(operation)}`, `Idle ${duration(idle)}`, ...(standby === undefined ? [] : [`Standby ${duration(standby)}`]), `${maintenanceLabel} ${duration(breakdown)}`].join(" · ");
}

function meterSummary(deur: DeurRecord): string {
  const evidence = canonicalMeterEvidence(deur);
  const parts: string[] = [];
  const reading = (start?: number, end?: number) => start === undefined && end === undefined ? "" : `${start ?? "—"} → ${end ?? "—"}`;
  if (["hourMeter", "both"].includes(evidence.meterRequirement)) {
    const value = reading(evidence.openingHourMeter, evidence.closingHourMeter);
    if (value) parts.push(`Hour meter ${value}`);
    else parts.push(`Hour meter (shift) ${(calculateShiftHourMeterSeconds(deur.events ?? [], deur.updatedAt, deur.creationSource) / 3600).toFixed(2)} h`);
  }
  if (["odometer", "both"].includes(evidence.meterRequirement)) {
    const value = reading(evidence.openingOdometer, evidence.closingOdometer);
    if (value) parts.push(`Odometer ${value}`);
  }
  if (deur.evidenceMode === "ODOMETER_TRIP" && deur.odometerTripEvidence) {
    const trip = deur.odometerTripEvidence;
    if (!parts.some((part) => part.startsWith("Odometer"))) {
      const value = reading(trip.startingOdometer, trip.endingOdometer);
      if (value) parts.push(`Odometer ${value}`);
    }
    parts.push(`Distance ${trip.totalDistance} km`);
  }
  else { const distance = deurShiftDistanceKilometers(deur); if (distance !== undefined) parts.push(`Distance ${distance} km`); }
  return parts.join(" · ") || "—";
}

export async function readRemoteDailyLogs(
  dependencies: Pick<ApplicationDependencies, "readRepositories">,
  options: { signal?: AbortSignal; today: string },
): Promise<RemoteDailyLogsModel> {
  const { deurs, equipment, operators, projects, rentals, rentalEquipmentLines } = dependencies.readRepositories;
  const [deurRows, equipmentRows, operatorRows, projectRows, rentalRows, lineRows] = await Promise.all([
    readAllCanonicalPages(deurs, options.signal),
    readAllCanonicalPages(equipment, options.signal),
    readAllCanonicalPages(operators, options.signal),
    readAllCanonicalPages(projects, options.signal),
    readAllCanonicalPages(rentals, options.signal),
    readAllCanonicalPages(rentalEquipmentLines, options.signal),
  ]);
  const equipmentById = new Map(equipmentRows.map((item) => [item.id, item]));
  const operatorsById = new Map(operatorRows.map((item) => [item.id, item]));
  const projectsById = new Map(projectRows.map((item) => [item.id, item]));
  const rentalsById = new Map(rentalRows.map((item) => [item.id, item]));
  const linesById = new Map(lineRows.map((item) => [item.id, item]));
  const current = currentEffectiveDeurs(deurRows);
  const rows = current.map((deur): RemoteDailyLogRow => {
    const machine = equipmentById.get(deur.equipmentId);
    const rental = rentalsById.get(deur.rentalId);
    const project = projectsById.get(deur.projectId ?? rental?.projectId ?? "");
    const line = deur.rentalEquipmentLineId ? linesById.get(deur.rentalEquipmentLineId) : undefined;
    const equipmentLabel = machine ? [machine.assetNo, machine.equipmentName].filter(Boolean).join(" · ") : "Unknown equipment";
    const operatorLabel = operatorsById.get(deur.operatorId)?.name || "Unknown operator";
    const projectLabel = project?.projectName || "Unassigned project";
    const rentalLabel = rental?.rentalNumber || "Unknown rental";
    const lineLabel = line ? `Line ${line.id.slice(0, 8)}` : deur.rentalEquipmentLineId ? `Line ${deur.rentalEquipmentLineId.slice(0, 8)} (unavailable)` : "—";
    const row = {
      id: deur.id, workDate: deur.workDate, deurNumber: deur.deurNumber || `DEUR ${deur.id.slice(0, 8)}`,
      equipment: equipmentLabel, operator: operatorLabel, project: projectLabel, rental: rentalLabel,
      rentalId: deur.rentalId, rentalEquipmentLine: lineLabel, shift: deur.shift ?? "—", status: deur.status,
      revision: `R${deur.revision?.revisionNumber ?? 1}`, activity: activitySummary(deur), meter: meterSummary(deur),
      searchText: "",
    };
    return { ...row, searchText: [row.deurNumber, row.equipment, row.operator, row.project, row.rental, row.status, row.shift, row.rentalEquipmentLine].join(" ").toLowerCase() };
  }).sort((a, b) => b.workDate.localeCompare(a.workDate) || a.id.localeCompare(b.id));
  return {
    rows, total: rows.length, today: rows.filter((row) => row.workDate === options.today).length,
    equipmentLogged: new Set(current.map((item) => item.equipmentId)).size,
    awaitingReview: current.filter((item) => ["Submitted", "Pending Acknowledgement"].includes(item.status)).length,
  };
}
