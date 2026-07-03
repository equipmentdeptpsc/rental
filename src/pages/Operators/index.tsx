import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useOperator } from "@/features/operators/context/OperatorContext";

export default function OperatorsPage() {
  const {
    operators,
    deleteOperator,
  } = useOperator();

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

      <div className="rounded-lg border bg-white overflow-hidden">

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

            {operators.map((operator) => (

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
                      onClick={() =>
                        deleteOperator(
                          operator.id
                        )
                      }
                    >
                      Delete
                    </Button>

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}