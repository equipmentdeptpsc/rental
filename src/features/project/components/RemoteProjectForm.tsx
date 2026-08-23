import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { requestCanonicalProjectRefresh } from "@/features/project/remote/canonicalProjectRefresh";

export default function RemoteProjectForm() {
  const { commandRepositories } = useApplicationDependenciesCompatibility();
  const navigate = useNavigate();
  const [form, setForm] = useState({ projectCode: "", name: "", location: "" });
  const identity = useRef<{ projectId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  const submission = useFormSubmission("Project", async () => {
    const command = identity.current ??= { projectId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await commandRepositories.canonicalProject!.createProject({ ...command, projectCode: form.projectCode.trim(), name: form.name.trim(), location: form.location.trim() || undefined });
    if (!result.success) throw new Error(result.message);
    requestCanonicalProjectRefresh();
    navigate("/projects");
  });
  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">New Project</h1><p className="mt-2 text-gray-500">Create a canonical remote Project.</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!form.projectCode.trim() || !form.name.trim()) return submission.fail("Enter a Project Code and Project Name."); void submission.submit(undefined); }}>{submission.feedback}<Input label="Project Code" required value={form.projectCode} onChange={(event) => update("projectCode", event.target.value)} /><Input label="Project Name" required value={form.name} onChange={(event) => update("name", event.target.value)} /><Input label="Location" value={form.location} onChange={(event) => update("location", event.target.value)} /><p className="text-sm text-slate-500">Customer is optional and is not available in this controlled UAT milestone.</p><div className="flex justify-end"><Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : "Create Project"}</Button></div></form></div>;
}
