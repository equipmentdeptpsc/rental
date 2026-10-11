import { useCallback, useEffect, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { equipmentReferenceKinds, type EquipmentReferenceKind, type EquipmentReferenceRecord } from "./contracts";

const titles: Record<EquipmentReferenceKind, string> = { brand: "Manufacturer / Brand", model: "Model", ownership: "Ownership Type", location: "Initial Location", condition: "Equipment Condition" };

export default function EquipmentReferenceMastersSection() {
  const { commandRepositories } = useApplicationDependenciesCompatibility();
  const repository = commandRepositories.equipmentReferenceMasters;
  const { hasPermission } = useAuth();
  const [kind, setKind] = useState<EquipmentReferenceKind>("brand");
  const [items, setItems] = useState<EquipmentReferenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EquipmentReferenceRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => {
    if (!repository) { setError("Canonical Equipment reference maintenance is unavailable."); setLoading(false); return; }
    setLoading(true); setError("");
    const result = await repository.list(kind);
    if (result.success) setItems(result.value);
    else setError(result.message);
    setLoading(false);
  }, [kind, repository]);
  useEffect(() => { void refresh(); }, [refresh]);
  const start = (item: EquipmentReferenceRecord | null) => {
    setEditing(item); setName(item?.name ?? ""); setCode(item?.code ?? ""); setDescription(item?.description ?? ""); setError(""); setOpen(true);
  };
  async function save() {
    if (!repository || !name.trim() || saving) return;
    setSaving(true); setError("");
    const commandId = crypto.randomUUID();
    const result = await repository.save({ kind, operation: editing ? "UPDATE" : "CREATE", id: editing?.id ?? crypto.randomUUID(), commandId, idempotencyKey: commandId, name: name.trim(), code: code.trim(), description: description.trim(), ...(editing ? { expectedRowVersion: editing.rowVersion } : {}) });
    setSaving(false);
    if (!result.success) { setError(result.message); return; }
    setOpen(false); await refresh();
  }
  async function setActive(item: EquipmentReferenceRecord) {
    if (!repository || saving) return;
    if (item.active && !window.confirm(`Deactivate ${item.name}? Existing Equipment retains this reference, but new Equipment cannot select it.`)) return;
    setSaving(true); setError("");
    const commandId = crypto.randomUUID();
    const result = await repository.save({ kind, operation: "SET_ACTIVE", id: item.id, commandId, idempotencyKey: commandId, active: !item.active, expectedRowVersion: item.rowVersion });
    setSaving(false);
    if (!result.success) setError(result.message);
    else await refresh();
  }
  return <section className="rounded-xl border bg-white p-4 sm:p-6" aria-label="Equipment reference masters">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-semibold">Equipment Reference Masters</h2><p className="text-sm text-slate-600">These canonical records supply the Equipment registration selectors. Updates take effect when the form is opened or refreshed.</p></div>{hasPermission("masterData.create") && <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => start(null)}>Add {titles[kind]}</button>}</div>
    <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Equipment reference types">{equipmentReferenceKinds.map((value) => <button type="button" role="tab" aria-selected={kind === value} key={value} className={`rounded-lg border px-3 py-2 text-sm ${kind === value ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => { setKind(value); setOpen(false); }}>{titles[value]}</button>)}</div>
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    {loading ? <p className="mt-4" role="status">Loading canonical records…</p> : items.length === 0 ? <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="status">No {titles[kind].toLowerCase()} records exist. {hasPermission("masterData.create") ? "Add an approved record to populate the Equipment selector." : "Ask a System Administrator to add an approved record."}</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Name</th><th className="p-2">Code</th><th className="p-2">Status</th><th className="p-2">Description</th>{hasPermission("masterData.update") && <th className="p-2">Actions</th>}</tr></thead><tbody>{items.map((item) => <tr className="border-b" key={item.id}><td className="p-2 font-medium">{item.name}</td><td className="p-2">{item.code || "—"}</td><td className="p-2">{item.active ? "Active" : "Inactive"}</td><td className="p-2">{item.description || "—"}</td>{hasPermission("masterData.update") && <td className="space-x-2 whitespace-nowrap p-2"><button type="button" className="text-blue-700 underline" onClick={() => start(item)}>Edit</button><button type="button" disabled={saving} className="text-blue-700 underline" onClick={() => void setActive(item)}>{item.active ? "Deactivate" : "Activate"}</button></td>}</tr>)}</tbody></table></div>}
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div role="dialog" aria-modal="true" aria-label={`${editing ? "Edit" : "Add"} ${titles[kind]}`} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl"><h3 className="text-xl font-semibold">{editing ? "Edit" : "Add"} {titles[kind]}</h3><label className="block text-sm">Name<input className="app-control mt-1 w-full" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm">Code<input className="app-control mt-1 w-full" maxLength={70} value={code} onChange={(event) => setCode(event.target.value)} /></label><label className="block text-sm">Description<textarea className="app-control mt-1 w-full" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded-lg border px-4 py-2" onClick={() => setOpen(false)}>Cancel</button><button type="button" disabled={!name.trim() || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button></div></div></div>}
  </section>;
}
