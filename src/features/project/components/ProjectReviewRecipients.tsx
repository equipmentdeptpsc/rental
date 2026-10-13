import { useEffect, useRef, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import type { ProjectReviewRecipient, ProjectReviewRecipientProjection } from "@/features/project/commands/contracts";

export default function ProjectReviewRecipients({ projectId }: { projectId: string }) {
  const { commandRepositories } = useApplicationDependenciesCompatibility();
  const repository = commandRepositories.canonicalProject;
  const { hasPermission } = useAuth();
  const [saved, setSaved] = useState<ProjectReviewRecipientProjection>();
  const [draft, setDraft] = useState<ProjectReviewRecipient[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const canRead = hasPermission("project.read");
  const canWrite = hasPermission("project.update") && typeof repository?.updateProjectReviewRecipients === "function";

  useEffect(() => {
    let active = true;
    if (!canRead || !repository?.readProjectReviewRecipients) return;
    setLoading(true);
    void repository.readProjectReviewRecipients(projectId).then((result) => {
      if (!active) return;
      if (result.success) {
        setSaved(result.value);
        setDraft(result.value.recipients.map((recipient) => ({ ...recipient })));
        setMessage("");
      } else setMessage(result.message);
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setMessage("Project reviewers could not be loaded. Refresh and try again."); } });
    return () => { active = false; };
  }, [canRead, projectId, repository]);

  if (!canRead || !repository?.readProjectReviewRecipients) return null;

  function edit(index: number, field: keyof ProjectReviewRecipient, value: string) {
    setDraft((current) => current.map((entry, at) => at === index ? { ...entry, [field]: value } : entry));
  }

  async function save() {
    if (!canWrite || !saved || !repository?.updateProjectReviewRecipients || working.current) return;
    const recipients = draft.map((recipient) => ({ name: recipient.name.trim(), email: recipient.email.trim().toLowerCase() }));
    if (recipients.length > 10 || recipients.some((recipient) => !recipient.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email))
      || new Set(recipients.map((recipient) => recipient.email)).size !== recipients.length) {
      setMessage("Enter up to ten reviewers with distinct valid email addresses and names.");
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage("");
    try {
      const commandId = crypto.randomUUID();
      const result = await repository.updateProjectReviewRecipients({ commandId, idempotencyKey: commandId, projectId, expectedVersion: saved.rowVersion, recipients });
      if (!result.success) { setMessage(result.message); return; }
      setSaved(result.value);
      setDraft(result.value.recipients.map((recipient) => ({ ...recipient })));
      setMessage("Project reviewers saved. Existing dispatches keep their original recipients.");
    } catch {
      setMessage("The reviewer update could not be confirmed. Refresh before retrying.");
    } finally { working.current = false; setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border bg-white p-6 shadow-sm" aria-label="Project Customer Review recipients">
    <div><h2 className="text-xl font-semibold">Customer Review recipients</h2><p className="text-sm text-slate-600">Project-specific reviewers. This configuration does not change the existing Rental-based dispatch until the Project-grouping release is certified. That release must not fall back to the Customer profile email and will use one shared Project-scoped link.</p></div>
    {loading ? <p>Loading reviewers…</p> : <>
      {message && <p role="status" className="text-sm">{message}</p>}
      {!saved ? <button type="button" className="underline" onClick={() => { setLoading(true); void repository.readProjectReviewRecipients?.(projectId).then((result) => { if (result.success) { setSaved(result.value); setDraft(result.value.recipients); setMessage(""); } else setMessage(result.message); setLoading(false); }); }}>Retry</button> : <>
        {draft.length === 0 && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No Project reviewer configured. Project-based dispatch will be blocked until an authorized user adds one.</p>}
        {draft.map((recipient, index) => <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}>
          <label className="text-sm">Reviewer name<input className="mt-1 w-full rounded border p-2" value={recipient.name} disabled={!canWrite || busy} onChange={(event) => edit(index, "name", event.target.value)} /></label>
          <label className="text-sm">Email<input className="mt-1 w-full rounded border p-2" type="email" value={recipient.email} disabled={!canWrite || busy} onChange={(event) => edit(index, "email", event.target.value)} /></label>
          {canWrite && <button type="button" className="self-end rounded border px-3 py-2" disabled={busy} onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}>Remove</button>}
        </div>)}
        {canWrite && <div className="flex gap-3"><button type="button" className="rounded border px-4 py-2" disabled={busy || draft.length >= 10} onClick={() => setDraft((current) => [...current, { name: "", email: "" }])}>Add reviewer</button><button type="button" className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save reviewers"}</button></div>}
      </>}
    </>}
  </section>;
}
