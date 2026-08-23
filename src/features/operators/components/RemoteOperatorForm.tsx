import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { OPERATOR_CERTIFICATION_TYPES, type OperatorCertificationType } from "@/features/operators/commands/contracts";
import { requestCanonicalOperatorRefresh } from "@/features/operators/remote/canonicalOperatorRefresh";

export default function RemoteOperatorForm() {
  const { commandRepositories } = useApplicationDependenciesCompatibility();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", licenseNumber: "", certificationType: "None" as OperatorCertificationType, joinedDate: "" });
  const identity = useRef<{ operatorId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  const submission = useFormSubmission("Operator", async () => {
    const command = identity.current ??= { operatorId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await commandRepositories.canonicalOperator!.createOperator({
      ...command,
      name: form.name.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.licenseNumber.trim() ? { licenseNumber: form.licenseNumber.trim() } : {}),
      certificationType: form.certificationType,
      ...(form.joinedDate ? { joinedDate: form.joinedDate } : {}),
    });
    if (!result.success) throw new Error(result.message);
    requestCanonicalOperatorRefresh();
    navigate("/operators");
  });
  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">New Operator</h1><p className="mt-2 text-gray-500">Create a canonical remote Operator business record.</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!form.name.trim()) return submission.fail("Enter an Operator Name."); void submission.submit(undefined); }}>{submission.feedback}<Input label="Name" required value={form.name} onChange={(event) => update("name", event.target.value)} /><Input label="Email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /><Input label="License Number" value={form.licenseNumber} onChange={(event) => update("licenseNumber", event.target.value)} /><Select label="Certification Type" value={form.certificationType} options={OPERATOR_CERTIFICATION_TYPES.map((value) => ({ value, label: value }))} onChange={(event) => update("certificationType", event.target.value)} /><Input label="Joined Date" type="date" value={form.joinedDate} onChange={(event) => update("joinedDate", event.target.value)} /><p className="text-sm text-slate-500">User linking, authentication, and Operator PIN provisioning are managed separately.</p><div className="flex justify-end"><Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : "Create Operator"}</Button></div></form></div>;
}
