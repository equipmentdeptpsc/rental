import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CertificationMultiSelect from "./CertificationMultiSelect";
import type { CertificationTypeRecord } from "@/features/masters/certification-type/types";
import { requestCanonicalOperatorRefresh } from "@/features/operators/remote/canonicalOperatorRefresh";

export default function RemoteOperatorForm() {
  const { commandRepositories } = useApplicationDependenciesCompatibility();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", licenseNumber: "", joinedDate: "" });
  const [types, setTypes] = useState<CertificationTypeRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => { let mounted = true; void commandRepositories.operatorCertifications?.listAssignableTypes().then((result) => { if (!mounted) return; if (result.success) setTypes(result.value); else setLoadError(result.error.message); }); return () => { mounted = false; }; }, [commandRepositories.operatorCertifications]);
  const identity = useRef<{ operatorId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  const assignmentIdentities = useRef(new Map<string, { commandId: string; idempotencyKey: string }>());
  const submission = useFormSubmission("Operator", async () => {
    const command = identity.current ??= { operatorId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await commandRepositories.canonicalOperator!.createOperator({
      ...command,
      name: form.name.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.licenseNumber.trim() ? { licenseNumber: form.licenseNumber.trim() } : {}),
      certificationType: types.find((type) => type.id === selected[0])?.name as never ?? "None",
      ...(form.joinedDate ? { joinedDate: form.joinedDate } : {}),
    });
    if (!result.success) throw new Error(result.message);
    const operatorCertifications = commandRepositories.operatorCertifications;
    if (operatorCertifications) {
      for (const certificationTypeId of selected) {
        const assignmentIdentity = assignmentIdentities.current.get(certificationTypeId) ?? { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
        assignmentIdentities.current.set(certificationTypeId, assignmentIdentity);
        const assignment = await operatorCertifications.assign({ operatorId: identity.current.operatorId, certificationTypeId, ...assignmentIdentity });
        if (!assignment.success) throw new Error(`Operator created, but certification assignment failed (${assignment.code ?? "unknown"}). Retry the assignment from Edit Operator.`);
      }
    }
    requestCanonicalOperatorRefresh();
    navigate("/operators");
  });
  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">New Operator</h1><p className="mt-2 text-gray-500">Create a canonical remote Operator business record.</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!form.name.trim()) return submission.fail("Enter an Operator Name."); void submission.submit(undefined); }}>{submission.feedback}{loadError&&<p role="alert" className="text-sm text-red-700">{loadError}</p>}<Input label="Name" required value={form.name} onChange={(event) => update("name", event.target.value)} /><Input label="Email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /><Input label="License Number" value={form.licenseNumber} onChange={(event) => update("licenseNumber", event.target.value)} /><CertificationMultiSelect options={types} selected={selected} onChange={setSelected} /><Input label="Joined Date" type="date" value={form.joinedDate} onChange={(event) => update("joinedDate", event.target.value)} /><p className="text-sm text-slate-500">User linking, authentication, and Operator PIN provisioning are managed separately.</p><div className="flex justify-end"><Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : "Create Operator"}</Button></div></form></div>;
}
