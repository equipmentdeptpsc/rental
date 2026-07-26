import { useState } from "react";
import Button from "@/components/ui/Button";
import { useOptionalAuth } from "@/features/auth/AuthContext";
import { managerApproverRepository } from "./managerApproverRepository";
import { saveManagerApproverConfiguration } from "./managerApproverService";

export default function ManagerApproverSettings() {
  const auth = useOptionalAuth();
  const existing = managerApproverRepository.getAll()[0];
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [message, setMessage] = useState("");
  const canEdit = !auth || auth.user?.role === "Admin";
  function save() {
    const result = saveManagerApproverConfiguration({ name, email, active });
    setMessage(result.success ? "Manager approver configuration saved." : result.message);
  }
  return <div className="rounded-xl border bg-white p-6">
    <h2 className="text-2xl font-semibold">Manager Approver</h2>
    <p className="mb-4 text-gray-500">The active Manager recipient used by local Rental approval emails.</p>
    {!canEdit && <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Only an Admin may change this configuration.</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-sm">Approver Name<input className="mt-1 w-full rounded border p-2" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block text-sm">Approver Email<input type="email" className="mt-1 w-full rounded border p-2" value={email} disabled={!canEdit} onChange={(event) => setEmail(event.target.value)} /></label>
    </div>
    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={active} disabled={!canEdit} onChange={(event) => setActive(event.target.checked)} /> Active default Manager approver</label>
    {message && <p className={`mt-3 text-sm ${message.endsWith("saved.") ? "text-green-700" : "text-red-700"}`}>{message}</p>}
    <div className="mt-4"><Button disabled={!canEdit} onClick={save}>Save Manager Approver</Button></div>
  </div>;
}
