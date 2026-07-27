import { useMemo, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import type { SystemRole } from "@/features/auth/domain/systemRole";
import { useOperator } from "@/features/operators/context/OperatorContext";

const roles: readonly SystemRole[] = [
  "system-administrator",
  "rental-operations",
  "finance",
  "management",
];

export default function UsersPage() {
  const { user: actor } = useAuth();
  const { operators } = useOperator();
  const service = useApplicationDependenciesCompatibility().authentication.userManagementService;
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ username: "", displayName: "", initialPassword: "", systemRole: "rental-operations" as SystemRole, operatorId: "" });
  const users = useMemo(
    () => actor ? service.search(actor, query) : [],
    [actor, query, service, version],
  );

  function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (!actor) return;
    try {
      service.create(actor, {
        username: form.username,
        displayName: form.displayName,
        initialPassword: form.initialPassword,
        systemRoles: [form.systemRole],
        operatorId: form.operatorId || undefined,
      });
      setForm({ username: "", displayName: "", initialPassword: "", systemRole: "rental-operations", operatorId: "" });
      setMessage("User created.");
      setVersion((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create user.");
    }
  }

  function toggleStatus(id: string, status: "active" | "inactive") {
    if (!actor) return;
    if (status === "active" && !window.confirm("Deactivate this user? Existing sessions will be rejected on restoration.")) return;
    try {
      status === "active" ? service.deactivate(actor, id) : service.activate(actor, id);
      setVersion((value) => value + 1);
      setMessage(status === "active" ? "User deactivated." : "User activated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update user.");
    }
  }

  return (
    <main className="space-y-6">
      <header><h1 className="text-2xl font-bold">User Management</h1><p className="text-sm text-slate-600">Application roles and local UAT accounts</p></header>
      {message && <p role="status" className="rounded border bg-white p-3">{message}</p>}
      <form className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-2" onSubmit={createUser}>
        <input aria-label="Username" className="rounded border p-2" placeholder="Username" required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <input aria-label="Display name" className="rounded border p-2" placeholder="Display name" required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        <input aria-label="Initial password" className="rounded border p-2" placeholder="Initial local password" required type="password" value={form.initialPassword} onChange={(event) => setForm({ ...form, initialPassword: event.target.value })} />
        <select aria-label="System role" className="rounded border p-2" value={form.systemRole} onChange={(event) => setForm({ ...form, systemRole: event.target.value as SystemRole })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <select aria-label="Linked operator" className="rounded border p-2" value={form.operatorId} onChange={(event) => setForm({ ...form, operatorId: event.target.value })}><option value="">No linked Operator</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select>
        <button className="rounded bg-blue-700 p-2 text-white" type="submit">Create User</button>
      </form>
      <input aria-label="Search users" className="w-full rounded border bg-white p-3" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">User</th><th className="p-3">Roles</th><th className="p-3">Provider</th><th className="p-3">Operator</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{users.map((item) => <tr className="border-b" key={item.id}><td className="p-3"><b>{item.displayName}</b><div>{item.username}</div></td><td className="p-3">{item.systemRoles.join(", ")}</td><td className="p-3">local</td><td className="p-3">{operators.find((operator) => operator.id === item.operatorId)?.name ?? "—"}</td><td className="p-3">{item.status}</td><td className="p-3"><button className="rounded border px-3 py-1" onClick={() => toggleStatus(item.id, item.status)}>{item.status === "active" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
    </main>
  );
}
