import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import LegacyDailyLogs from "./DailyLogs/index";

type CanonicalDailyLogData = { deurs: DeurRecord[]; rentals: RentalRecord[]; equipment: EquipmentRecord[]; operators: Operator[]; projects: ProjectRecord[] };

export default function DailyLogs() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return configuration.persistenceMode === PersistenceMode.Remote ? <CanonicalDailyLogs /> : <LegacyDailyLogs />;
}

function CanonicalDailyLogs() {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [data, setData] = useState<CanonicalDailyLogData>({ deurs: [], rentals: [], equipment: [], operators: [], projects: [] });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setState("loading");
    void Promise.all([
      readRepositories.deurs.list(),
      readRepositories.rentals.list(),
      readRepositories.equipment.list(),
      readRepositories.operators.list(),
      readRepositories.projects.list(),
    ]).then(([deurs, rentals, equipment, operators, projects]) => {
      if (![deurs, rentals, equipment, operators, projects].every((result) => result.success)) {
        setError("Canonical Daily Logs data could not be loaded.");
        setState("error");
        return;
      }
      setData({ deurs: deurs.value.items, rentals: rentals.value.items, equipment: equipment.value.items, operators: operators.value.items, projects: projects.value.items });
      setError("");
      setState("ready");
    }).catch(() => { setError("Canonical Daily Logs data could not be loaded."); setState("error"); });
  };

  useEffect(() => { load(); }, [readRepositories]);

  const equipmentById = useMemo(() => new Map(data.equipment.map((item) => [item.id, item])), [data.equipment]);
  const operatorsById = useMemo(() => new Map(data.operators.map((item) => [item.id, item])), [data.operators]);
  const projectsById = useMemo(() => new Map(data.projects.map((item) => [item.id, item])), [data.projects]);
  const rentalsById = useMemo(() => new Map(data.rentals.map((item) => [item.id, item])), [data.rentals]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.deurs.filter((deur) => {
      const equipment = equipmentById.get(deur.equipmentId), operator = operatorsById.get(deur.operatorId), project = deur.projectId ? projectsById.get(deur.projectId) : undefined, rental = rentalsById.get(deur.rentalId);
      const text = `${deur.deurNumber ?? deur.id} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.projectName ?? ""} ${rental?.rentalNumber ?? ""}`.toLowerCase();
      return (!date || deur.workDate === date) && (!equipmentId || deur.equipmentId === equipmentId) && (!operatorId || deur.operatorId === operatorId) && (!status || deur.status === status) && (!query || text.includes(query));
    });
  }, [data.deurs, date, equipmentById, equipmentId, operatorId, operatorsById, projectsById, rentalsById, search, status]);

  const statuses = [...new Set(data.deurs.map((item) => item.status))];
  return <div className="app-page space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-display text-3xl font-bold">Daily Logs</h1><p className="mt-1 text-slate-500">Canonical Digital Equipment Utilization Records, read-only.</p></div><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={load}>Refresh</button></div><div className="app-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-medium text-slate-600">Work date<input aria-label="Daily log work date" className="app-control mt-1 w-full" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="text-xs font-medium text-slate-600">Equipment<select aria-label="Daily log equipment" className="app-control mt-1 w-full" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}><option value="">All equipment</option>{data.equipment.map((item) => <option key={item.id} value={item.id}>{item.assetNo} · {item.equipmentName}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Operator<select aria-label="Daily log operator" className="app-control mt-1 w-full" value={operatorId} onChange={(event) => setOperatorId(event.target.value)}><option value="">All operators</option>{data.operators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Status<select aria-label="Daily log status" className="app-control mt-1 w-full" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Search<input aria-label="Daily log search" className="app-control mt-1 w-full" placeholder="DEUR, rental, project" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>{state === "loading" && <div className="app-card p-8 text-sm text-slate-500" role="status">Loading canonical Daily Logs…</div>}{state === "error" && <div className="app-card p-8 text-sm text-rose-700" role="alert">{error}<button className="ml-3 underline" onClick={load}>Retry</button></div>}{state === "ready" && <ResponsiveTable><div className="app-card min-w-[1100px] overflow-hidden"><table className="app-table w-full text-sm"><thead><tr>{["Work date", "DEUR", "Equipment", "Operator", "Rental", "Project", "Status", "Operating", "Idle", "Standby", "Breakdown", "Details"].map((label) => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.length ? filtered.map((deur) => { const equipment = equipmentById.get(deur.equipmentId), operator = operatorsById.get(deur.operatorId), project = deur.projectId ? projectsById.get(deur.projectId) : undefined, rental = rentalsById.get(deur.rentalId); return <tr key={deur.id}><td className="p-3">{deur.workDate}</td><td className="p-3 font-semibold">{deur.deurNumber ?? deur.id}</td><td className="p-3">{equipment ? `${equipment.assetNo} · ${equipment.equipmentName}` : deur.equipmentId}</td><td className="p-3">{operator?.name ?? deur.operatorId}</td><td className="p-3">{rental?.rentalNumber ?? deur.rentalId}</td><td className="p-3">{project?.projectName ?? "—"}</td><td className="p-3">{deur.status}</td><td className="p-3">{(deur.totalOperatingMinutes / 60).toFixed(2)}h</td><td className="p-3">{(deur.totalIdleMinutes / 60).toFixed(2)}h</td><td className="p-3">{((deur.totalStandbyMinutes ?? 0) / 60).toFixed(2)}h</td><td className="p-3">{(deur.totalMaintenanceMinutes / 60).toFixed(2)}h</td><td className="p-3"><Link className="text-blue-600 hover:underline" to={`/rentals/${encodeURIComponent(deur.rentalId)}/workspace?tab=deur`}>Open Rental DEUR</Link></td></tr>; }) : <tr><td className="p-8 text-center text-slate-500" colSpan={12}>No canonical Daily Logs match the selected filters.</td></tr>}</tbody></table></div></ResponsiveTable>}</div>;
}
