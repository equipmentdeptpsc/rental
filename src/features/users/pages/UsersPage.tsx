import { useMemo, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import type { SystemRole } from "@/features/auth/domain/systemRole";
import { useOperator } from "@/features/operators/context/OperatorContext";

const roles: readonly SystemRole[] = ["system-administrator", "rental-operations", "finance", "management"];
const emptyForm = { username: "", displayName: "", initialPassword: "", systemRole: "rental-operations" as SystemRole, operatorId: "" };

export default function UsersPage() {
  const { user: actor } = useAuth();
  const { operators } = useOperator();
  const service = useApplicationDependenciesCompatibility().authentication.userManagementService;
  const [version, setVersion] = useState(0), [query, setQuery] = useState(""), [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm), [editingId, setEditingId] = useState<string>();
  const activeOperators = useMemo(() => operators.filter((operator) => operator.status === "Active"), [operators]);
  const users = useMemo(() => actor ? service.search(actor, query) : [], [actor, query, service, version]);

  function submitUser(event: React.FormEvent) {
    event.preventDefault(); if (!actor) return;
    try {
      if (editingId) service.update(actor, editingId, { username: form.username, displayName: form.displayName, systemRoles: [form.systemRole], operatorId: form.operatorId || undefined });
      else service.create(actor, { username: form.username, displayName: form.displayName, initialPassword: form.initialPassword, systemRoles: [form.systemRole], operatorId: form.operatorId || undefined });
      setForm(emptyForm); setEditingId(undefined); setVersion((value) => value + 1);
      setMessage(editingId ? "User updated. Sign out and sign back in for the repaired link to take effect." : "User created.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save user."); }
  }

  function editUser(id: string) {
    const selected = users.find((item) => item.id === id); if (!selected) return;
    setEditingId(id); setForm({ username: selected.username, displayName: selected.displayName, initialPassword: "", systemRole: selected.systemRoles[0] ?? "rental-operations", operatorId: selected.operatorId ?? "" });
    setMessage(selected.operatorId && !activeOperators.some((operator) => operator.id === selected.operatorId) ? "The existing Operator link is unavailable. Select an active Operator before saving." : "");
  }

  function toggleStatus(id: string, status: "active" | "inactive") {
    if (!actor) return;
    if (status === "active" && !window.confirm("Deactivate this user? Existing sessions will be rejected on restoration.")) return;
    try { status === "active" ? service.deactivate(actor, id) : service.activate(actor, id); setVersion((value) => value + 1); setMessage(status === "active" ? "User deactivated." : "User activated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update user."); }
  }

  return <main className="space-y-6">
    <header><h1 className="text-2xl font-bold">User Management</h1><p className="text-sm text-slate-600">Application roles and local UAT accounts</p></header>
    {message && <p role="status" className="rounded border bg-white p-3">{message}</p>}
    <form className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-2" onSubmit={submitUser}>
      <input aria-label="Username" className="rounded border p-2" placeholder="Username" required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
      <input aria-label="Display name" className="rounded border p-2" placeholder="Display name" required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
      <input aria-label="Initial password" className="rounded border p-2" placeholder={editingId ? "Password unchanged" : "Initial local password"} required={!editingId} disabled={Boolean(editingId)} type="password" value={form.initialPassword} onChange={(event) => setForm({ ...form, initialPassword: event.target.value })} />
      <select aria-label="System role" className="rounded border p-2" value={form.systemRole} onChange={(event) => setForm({ ...form, systemRole: event.target.value as SystemRole })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
      <select aria-label="Linked operator" className="rounded border p-2" value={activeOperators.some((operator) => operator.id === form.operatorId) ? form.operatorId : ""} onChange={(event) => setForm({ ...form, operatorId: event.target.value })}><option value="">No linked Operator / Dispatcher</option>{activeOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select>
      <button className="rounded bg-blue-700 p-2 text-white" type="submit">{editingId ? "Save User" : "Create User"}</button>
      {editingId && <button className="rounded border p-2" type="button" onClick={() => { setEditingId(undefined); setForm(emptyForm); }}>Cancel</button>}
    </form>
    <input aria-label="Search users" className="w-full rounded border bg-white p-3" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">User</th><th className="p-3">Roles</th><th className="p-3">Provider</th><th className="p-3">Operator</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{users.map((item) => { const linked = operators.find((operator) => operator.id === item.operatorId); return <tr className="border-b" key={item.id}><td className="p-3"><b>{item.displayName}</b><div>{item.username}</div></td><td className="p-3">{item.systemRoles.join(", ")}</td><td className="p-3">local</td><td className="p-3">{linked?.status === "Active" ? linked.name : item.operatorId ? "Unavailable — repair required" : "Dispatcher / not linked"}</td><td className="p-3">{item.status}</td><td className="space-x-2 p-3"><button className="rounded border px-3 py-1" onClick={() => editUser(item.id)}>Edit</button><button className="rounded border px-3 py-1" onClick={() => toggleStatus(item.id, item.status)}>{item.status === "active" ? "Deactivate" : "Activate"}</button></td></tr>; })}</tbody></table></div>
  </main>;
}
