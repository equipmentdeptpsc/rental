import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { useCanonicalEquipmentDetail } from "../hooks/useCanonicalEquipmentDetail";
import { requestCanonicalEquipmentRefresh } from "../remote/canonicalEquipmentRefresh";
import { BETA_MAINTENANCE_TYPES, meterRequirementForMaintenanceType, normalizeMaintenanceType, type BetaMaintenanceType, type EquipmentMaintenanceType } from "../services/maintenanceMeterPolicy";
import { getEquipmentRuntimeCapability } from "../services/equipmentRuntimeCapability";

export default function RemoteEquipmentMaintenanceEdit() {
  const { id } = useParams();
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const { equipment, retry } = useCanonicalEquipmentDetail(id);
  const [selected, setSelected] = useState<BetaMaintenanceType>("Hour Meter");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const identity = useRef<{ commandId: string; idempotencyKey: string } | undefined>(undefined);
  const row = equipment.status === "ready" ? equipment.value : null;
  const maintenance = row?.maintenanceType as EquipmentMaintenanceType | undefined;
  const knownType = meterRequirementForMaintenanceType(maintenance) !== undefined;
  const capability = getEquipmentRuntimeCapability(configuration, Boolean(commandRepositories.canonicalEquipment));
  const editable = Boolean(capability.canonicalMaintenanceUpdate && hasPermission("equipment.update") && row?.rowVersion !== undefined && knownType);

  useEffect(() => { if (maintenance && knownType) setSelected(normalizeMaintenanceType(maintenance)); }, [maintenance, knownType]);

  async function save() {
    if (!row || !id || !editable || busy || !commandRepositories.canonicalEquipment || row.rowVersion === undefined) return;
    setBusy(true); setMessage("");
    const command = identity.current ??= { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    try {
      const result = await commandRepositories.canonicalEquipment.updateMaintenanceType({ ...command, equipmentId: id, expectedVersion: row.rowVersion, maintenanceType: selected });
      if (!result.success) {
        setMessage(result.message);
        if (result.refreshRequired) { identity.current = undefined; retry(); }
        return;
      }
      identity.current = undefined;
      requestCanonicalEquipmentRefresh();
      retry();
      setMessage("Maintenance Type saved.");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-2xl space-y-5 p-8">
    <h1 className="text-3xl font-bold">Edit Equipment Maintenance Type</h1>
    {equipment.status === "loading" && <p>Loading Equipment…</p>}
    {equipment.status === "error" && <p role="alert">Equipment could not be loaded. <button type="button" className="underline" onClick={retry}>Retry</button></p>}
    {equipment.status === "ready" && !row && <p role="alert">Equipment not found.</p>}
    {row && <>
      <p className="text-slate-600">{row.equipmentName} ({row.assetNo})</p>
      <label className="block text-sm font-medium">Maintenance Type
        <select className="app-control mt-1 w-full" value={knownType ? selected : ""} disabled={!editable || busy} onChange={(event) => setSelected(event.target.value as BetaMaintenanceType)}>
          {!knownType && <option value="">Unsupported historical value</option>}
          {BETA_MAINTENANCE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {!editable && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Maintenance Type editing is currently unavailable.</p>}
      {message && <p role="status">{message}</p>}
      <div className="flex gap-3"><button type="button" className="rounded bg-blue-700 px-4 py-2 text-white disabled:bg-slate-400" disabled={!editable || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save Maintenance Type"}</button><Link className="px-4 py-2 text-blue-700 underline" to={`/equipment/${id}`}>View Equipment</Link></div>
    </>}
  </main>;
}
