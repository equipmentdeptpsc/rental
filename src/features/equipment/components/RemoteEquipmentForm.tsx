import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { EQUIPMENT_MAINTENANCE_TYPES, type EquipmentReferenceData } from "@/features/equipment/commands/contracts";
import { requestCanonicalEquipmentRefresh } from "@/features/equipment/remote/canonicalEquipmentRefresh";

export default function RemoteEquipmentForm() {
  const repository = useApplicationDependenciesCompatibility().commandRepositories.canonicalEquipment!;
  const navigate = useNavigate();
  const [reference, setReference] = useState<{ loading: boolean; data?: EquipmentReferenceData; error?: string }>({ loading: true });
  const [form, setForm] = useState({ assetNo: "", equipmentName: "", maintenanceType: "Engine Hours" as typeof EQUIPMENT_MAINTENANCE_TYPES[number], costCodeId: "", currentReading: "", remarks: "" });
  const identity = useRef<{ equipmentId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  useEffect(() => { let active = true; void repository.readReferenceData().then((result) => { if (active) setReference(result.success ? { loading: false, data: result.value } : { loading: false, error: result.message }); }); return () => { active = false; }; }, [repository]);
  const submission = useFormSubmission("Equipment", async () => {
    const command = identity.current ??= { equipmentId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await repository.createEquipment({ ...command, assetNo: form.assetNo.trim(), equipmentName: form.equipmentName.trim(), maintenanceType: form.maintenanceType, costCodeId: form.costCodeId, ...(form.currentReading.trim() ? { currentReading: Number(form.currentReading) } : {}), ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}) });
    if (!result.success) throw new Error(result.message);
    requestCanonicalEquipmentRefresh(); navigate("/equipment");
  });
  if (reference.loading) return <div className="p-8 text-slate-500">Loading Equipment reference data…</div>;
  if (!reference.data) return <div className="p-8" role="alert">{reference.error ?? "Equipment reference data could not be loaded."}</div>;
  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">New Equipment</h1><p className="mt-2 text-gray-500">Create canonical remote Equipment.</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!form.assetNo.trim() || !form.equipmentName.trim() || !form.costCodeId) return submission.fail("Enter Asset Number, Equipment Name, and Cost Code."); if (form.currentReading.trim() && (!Number.isFinite(Number(form.currentReading)) || Number(form.currentReading) < 0)) return submission.fail("Current Reading must be zero or greater."); void submission.submit(undefined); }}>{submission.feedback}<Input label="Asset Number" required value={form.assetNo} onChange={(event) => setForm({ ...form, assetNo: event.target.value })} /><Input label="Equipment Name" required value={form.equipmentName} onChange={(event) => setForm({ ...form, equipmentName: event.target.value })} /><label className="block text-sm font-medium">Maintenance Type<select className="app-control mt-1 w-full" value={form.maintenanceType} onChange={(event) => setForm({ ...form, maintenanceType: event.target.value as typeof form.maintenanceType })}>{EQUIPMENT_MAINTENANCE_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-medium">Cost Code<select required className="app-control mt-1 w-full" value={form.costCodeId} onChange={(event) => setForm({ ...form, costCodeId: event.target.value })}><option value="">Select Cost Code</option>{reference.data.costCodes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><Input label="Current Reading" type="number" min="0" value={form.currentReading} onChange={(event) => setForm({ ...form, currentReading: event.target.value })} /><Input label="Remarks" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /><div className="flex justify-end"><Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : "Create Equipment"}</Button></div></form></div>;
}
