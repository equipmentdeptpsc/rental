import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useOperator } from "@/features/operators/context/OperatorContext";
import { useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useCanonicalOperatorData } from "@/features/operators/hooks/useCanonicalOperatorData";
import { getOperatorRuntimeCapability } from "@/features/operators/services/operatorRuntimeCapability";
import { useAuth } from "@/features/auth/AuthContext";

export default function OperatorsPage() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const capability = getOperatorRuntimeCapability(configuration, Boolean(commandRepositories.canonicalOperator));
  return capability.canonicalReads ? <CanonicalOperatorsPage canCreate={capability.canonicalMutations && hasPermission("operator.manage")} /> : <LocalOperatorsPage />;
}

function CanonicalOperatorsPage({ canCreate }: { canCreate: boolean }) {
  const data = useCanonicalOperatorData();
  const [query, setQuery] = useState("");
  if (data.status === "loading") return <div className="p-8 text-slate-500">Loading canonical Operators…</div>;
  if (data.status === "error") return <div className="p-8" role="alert">{data.message}<button className="ml-3 underline" onClick={data.retry}>Retry</button></div>;
  const term = query.trim().toLocaleLowerCase();
  const visible = data.items.filter((operator) => !operator.deleted && (!term || `${operator.name} ${operator.licenseNumber ?? ""} ${operator.email ?? ""}`.toLocaleLowerCase().includes(term)));
  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">Operators</h1><p className="text-gray-500">Canonical company Operators. User links, PIN changes, edit, and deactivation remain unavailable.</p></div>{canCreate && <Link to="/operators/new"><Button>New Operator</Button></Link>}</div><input aria-label="Search Operators" className="w-full rounded border bg-white p-3" placeholder="Search canonical Operators" value={query} onChange={(event) => setQuery(event.target.value)} />{!visible.length ? <div className="rounded-lg border bg-white p-8 text-center text-slate-500">No canonical Operators found.</div> : <ResponsiveTable><div className="min-w-max rounded-lg border bg-white"><table className="min-w-full"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Certification</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{visible.map((operator) => <tr className="border-t" key={operator.id}><td className="p-3">{operator.name}</td><td className="p-3">{operator.certificationType ?? "—"}</td><td className="p-3">{operator.status}</td></tr>)}</tbody></table></div></ResponsiveTable>}</div>;
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
