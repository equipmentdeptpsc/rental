import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useOperator } from "@/features/operators/context/OperatorContext";
import { useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useCanonicalOperatorData } from "@/features/operators/hooks/useCanonicalOperatorData";
import { getOperatorRuntimeCapability } from "@/features/operators/services/operatorRuntimeCapability";
import { useAuth } from "@/features/auth/AuthContext";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import { EmptyDataState, ErrorState, LoadingState } from "@/components/ui/AsyncState";

export default function OperatorsPage() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const capability = getOperatorRuntimeCapability(configuration, Boolean(commandRepositories.canonicalOperator));
  return capability.canonicalReads ? <CanonicalOperatorsPage canCreate={capability.canonicalMutations && hasPermission("operator.create")} /> : <LocalOperatorsPage />;
}

function CanonicalOperatorsPage({ canCreate }: { canCreate: boolean }) {
  const data = useCanonicalOperatorData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  if (data.status === "loading") return <main className="app-page"><PageHeader title="Operators" description="People, qualifications, and linked operational access." /><LoadingState label="Loading canonical Operators…" /></main>;
  if (data.status === "error") return <main className="app-page"><PageHeader title="Operators" description="People, qualifications, and linked operational access." /><ErrorState message={data.message} onRetry={data.retry} /></main>;
  const term = query.trim().toLocaleLowerCase();
  const visible = data.items.filter((operator) => !operator.deleted && (status === "All" || operator.status === status) && (!term || `${operator.name} ${operator.licenseNumber ?? ""} ${operator.email ?? ""} ${operator.linkedUsername ?? ""} ${operator.linkedUserDisplayName ?? ""}`.toLocaleLowerCase().includes(term)));
  return <main className="app-page"><PageHeader title="Operators" description="People, qualifications, and linked operational access." actions={canCreate && <Link to="/operators/new"><Button>New Operator</Button></Link>} /><FilterBar onClear={() => { setQuery(""); setStatus("All"); }} canClear={Boolean(query || status !== "All")}><label className="min-w-60 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">Search Operators<input aria-label="Search Operators" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" placeholder="Name, username, certification…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Status<select aria-label="Operator status" className="mt-1 block rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option>{[...new Set(data.items.map((operator) => operator.status))].map((value) => <option key={value}>{value}</option>)}</select></label></FilterBar>{!visible.length ? <EmptyDataState title="No Operators match these filters" description={data.items.length ? "Try clearing a filter or searching by another identity field." : "Add an Operator to start assigning field work."} action={canCreate ? <Link to="/operators/new"><Button>Add Operator</Button></Link> : undefined} /> : <ResponsiveTable><div className="min-w-max overflow-hidden rounded-xl border bg-white dark:border-slate-700 dark:bg-slate-900"><table className="min-w-full"><thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="p-3 text-left">Operator</th><th className="p-3 text-left">Linked login</th><th className="p-3 text-left">Certification</th><th className="p-3 text-left">Assignments</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Actions</th></tr></thead><tbody>{visible.map((operator) => <tr className="border-t dark:border-slate-700" key={operator.id}><td className="p-3"><div className="font-medium">{operator.name}</div>{operator.licenseNumber && <div className="text-xs text-slate-500">{operator.licenseNumber}</div>}</td><td className="p-3">{operator.linkedUsername ? <><div>{operator.linkedUserDisplayName ?? "Linked user"}</div><div className="text-xs text-slate-500">{operator.linkedUsername}</div></> : <span className="text-slate-500">Not linked</span>}</td><td className="p-3">{operator.certificationType ?? "—"}</td><td className="p-3">{operator.assignmentCount}{operator.currentAssignment && <div className="text-xs text-slate-500">Active: {operator.currentAssignment}</div>}</td><td className="p-3"><StatusBadge tone={operator.active ? "success" : "neutral"}>{operator.status}</StatusBadge></td><td className="p-3">{canCreate ? <Link className="text-blue-700 hover:underline dark:text-blue-300" to={`/operators/edit/${operator.id}`}>Edit</Link> : <span className="text-xs text-slate-500">Read-only canonical view</span>}</td></tr>)}</tbody></table></div></ResponsiveTable>}</main>;
}

function LocalOperatorsPage() {
  const {
    operators,
    deleteOperator,
  } = useOperator();
  const[query,setQuery]=useState("");const visible=operators.filter(operator=>`${operator.name} ${operator.licenseNumber} ${operator.email}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Operators
          </h1>

          <p className="text-gray-500">
            Manage certified operators.
          </p>

        </div>

        <Link to="/operators/new">

          <Button>
            New Operator
          </Button>

        </Link>

      </div>

      <input aria-label="Search Operators" className="w-full rounded border bg-white p-3" placeholder="Search operator name, code, or linked user" value={query} onChange={event=>setQuery(event.target.value)}/>
      <ResponsiveTable><div className="rounded-lg border bg-white min-w-max">

        <table className="min-w-full">

          <thead className="bg-slate-50">

            <tr>

              <th className="p-3 text-left">
                Name
              </th>

              <th className="p-3 text-left">
                Certification
              </th>

              <th className="p-3 text-left">
                Status
              </th>

              <th className="p-3 text-left">
                Action
              </th>

            </tr>

          </thead>

          <tbody>

            {visible.map((operator) => (

              <tr
                key={operator.id}
                className="border-t"
              >

                <td className="p-3">
                  {operator.name}
                </td>

                <td className="p-3">
                  {operator.certificationType}
                </td>

                <td className="p-3">
                  {operator.status}
                </td>

                <td className="p-3">

                  <div className="flex gap-2">

                    <Link
                      to={`/operators/edit/${operator.id}`}
                    >
                      <Button>
                        Edit
                      </Button>
                    </Link>

                    <Button
                      onClick={() => {
                        const result = deleteOperator(operator.id);

                        if (!result.success) {
                          alert(result.message);
                        }
                      }}
                    >
                      Delete
                    </Button>

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div></ResponsiveTable>

    </div>
  );
}
