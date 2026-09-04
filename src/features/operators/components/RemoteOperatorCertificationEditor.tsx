import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import CertificationMultiSelect from "./CertificationMultiSelect";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";

export default function RemoteOperatorCertificationEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { readRepositories, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const [operatorName, setOperatorName] = useState("");
  const [types, setTypes] = useState<any[]>([]);
  const [historical, setHistorical] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!id) return; let mounted = true; void Promise.all([readRepositories.operators.getById(id), commandRepositories.operatorCertifications?.listAssignableTypes(), readRepositories.operatorCertifications.listForOperator(id)]).then(([operator, assignable, current]) => { if (!mounted) return; if (operator.success && operator.value) setOperatorName(operator.value.name); if (assignable?.success) setTypes(assignable.value); if (current.success) { setHistorical(current.value); setSelected(current.value.filter((item) => item.active).map((item) => item.certificationTypeId)); } }); return () => { mounted = false; }; }, [id, readRepositories, commandRepositories.operatorCertifications]);
  const save = async () => { if (!id || !commandRepositories.operatorCertifications || !hasPermission("operator.update")) return; setBusy(true); setMessage(""); const current = historical.filter((item) => item.active).map((item) => item.certificationTypeId); const add = selected.filter((value) => !current.includes(value)); const remove = current.filter((value) => !selected.includes(value)); for (const certificationTypeId of add) { const result = await commandRepositories.operatorCertifications.assign({ operatorId: id, certificationTypeId, commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }); if (!result.success) { setMessage(`Some assignments were not applied (${result.code ?? "unknown"}). Retry safely.`); setBusy(false); return; } } for (const certificationTypeId of remove) { const result = await commandRepositories.operatorCertifications.remove({ operatorId: id, certificationTypeId, commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }); if (!result.success) { setMessage(`Some assignments were not removed (${result.code ?? "unknown"}). Retry safely.`); setBusy(false); return; } } setMessage("Certification assignments saved."); setBusy(false); };
  const activeCount = useMemo(() => selected.length, [selected]);
  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">Edit Operator Certifications</h1><p className="mt-2 text-slate-500">{operatorName || "Operator"} · certification assignments only. Other Operator fields remain read-only in remote mode.</p></div><CertificationMultiSelect options={types} selected={selected} historical={historical} onChange={setSelected} disabled={!hasPermission("operator.update")} /><p className="text-sm text-slate-500">{activeCount} active certification{activeCount === 1 ? "" : "s"} selected.</p>{message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}<div className="flex justify-end gap-3"><Button variant="outline" onClick={() => navigate("/operators")}>Back</Button><Button onClick={() => void save()} disabled={busy||!hasPermission("operator.update")}>{busy ? "Saving…" : "Save certifications"}</Button></div></div>;
}
