import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useCanonicalCustomerData } from "@/features/customer/hooks/useCanonicalCustomerData";
import { requestCanonicalProjectRefresh } from "@/features/project/remote/canonicalProjectRefresh";
import { buildCanonicalProjectCreateCommand } from "@/features/project/services/buildCanonicalProjectCreateCommand";

export default function RemoteProjectForm() {
  const { commandRepositories } = useApplicationDependenciesCompatibility();
  const navigate = useNavigate();
  const customers = useCanonicalCustomerData();
  const [form, setForm] = useState({ projectCode: "", name: "", customerId: "", location: "" });
  const identity = useRef<{ projectId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  const submission = useFormSubmission("Project", async () => {
    const command = identity.current ??= { projectId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await commandRepositories.canonicalProject!.createProject(buildCanonicalProjectCreateCommand(command, form));
    if (!result.success) throw new Error(result.message);
    requestCanonicalProjectRefresh();
    navigate("/projects");
  });
  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const customerOptions = [{ value: "", label: "No Customer" }, ...(customers.status === "loaded" ? customers.items.filter((customer) => customer.active).map((customer) => ({ value: customer.id, label: `${customer.customerCode} — ${customer.companyName}` })) : [])];
  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">New Project</h1><p className="mt-2 text-gray-500">Create a canonical remote Project.</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!form.projectCode.trim() || !form.name.trim()) return submission.fail("Enter a Project Code and Project Name."); void submission.submit(undefined); }}>{submission.feedback}<Input label="Project Code" required value={form.projectCode} onChange={(event) => update("projectCode", event.target.value)} /><Input label="Project Name" required value={form.name} onChange={(event) => update("name", event.target.value)} /><Select label="Customer" value={form.customerId} options={customerOptions} loading={customers.status === "loading"} helperText={customers.status === "error" ? "Canonical Customers could not be loaded. Customer may be left blank." : "Optional canonical Customer relationship."} onChange={(event) => update("customerId", event.target.value)} /><Input label="Location" value={form.location} onChange={(event) => update("location", event.target.value)} /><div className="flex justify-end"><Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : "Create Project"}</Button></div></form></div>;
}
