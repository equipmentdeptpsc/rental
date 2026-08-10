import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useOperator } from "@/features/operators/context/OperatorContext";
import { useState } from "react";

export default function OperatorsPage() {
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
