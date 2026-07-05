import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useDailyLog } from "@/features/daily-log";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

export default function DailyLogs() {
  const { logs } = useDailyLog();

  const { equipment } = useEquipment();

  const { operators } = useOperator();

  const { projects } = useProject();

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Daily Equipment Logs
          </h1>

          <p className="mt-1 text-gray-500">
            Record daily equipment utilization.
          </p>

        </div>

        <Link to="/daily-logs/new">
          <Button>
            New Daily Log
          </Button>
        </Link>

      </div>

      <div className="grid gap-4 md:grid-cols-4">

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">
            Total Logs
          </p>

          <p className="mt-2 text-3xl font-bold">
            {logs.length}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">
            Equipment Logged
          </p>

          <p className="mt-2 text-3xl font-bold">
            {
              new Set(
                logs.map(
                  (x) => x.equipmentId
                )
              ).size
            }
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">
            Total Usage
          </p>

          <p className="mt-2 text-3xl font-bold">
            {logs.reduce(
              (a, b) =>
                a +
                b.workingHours,
              0
            )}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">
            Today's Logs
          </p>

          <p className="mt-2 text-3xl font-bold">
            {
              logs.filter(
                (x) =>
                  x.date ===
                  new Date()
                    .toISOString()
                    .split("T")[0]
              ).length
            }
          </p>
        </div>

      </div>

      <div className="overflow-hidden rounded-xl border bg-white">

        <table className="min-w-full text-sm">

          <thead className="bg-gray-100">

            <tr>

              <th className="px-4 py-3 text-left">
                Date
              </th>

              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-left">
                Operator
              </th>

              <th className="px-4 py-3 text-left">
                Project
              </th>

              <th className="px-4 py-3 text-right">
                Start
              </th>

              <th className="px-4 py-3 text-right">
                End
              </th>

              <th className="px-4 py-3 text-right">
                Usage
              </th>

            </tr>

          </thead>

          <tbody>

            {logs.length === 0 && (

              <tr>

                <td
                  colSpan={7}
                  className="py-12 text-center text-gray-500"
                >
                  No daily logs found.
                </td>

              </tr>

            )}

            {logs.map((log) => {

              const machine =
                equipment.find(
                  (x) =>
                    x.id ===
                    log.equipmentId
                );

              const operator =
                operators.find(
                  (x) =>
                    x.id ===
                    log.operatorId
                );

              const project =
                projects.find(
                  (x) =>
                    x.id ===
                    log.projectId
                );

              return (

                <tr
                  key={log.id}
                  className="border-t"
                >

                  <td className="px-4 py-3">
                    {log.date}
                  </td>

                  <td className="px-4 py-3">
                    {machine?.assetNo} -{" "}
                    {
                      machine?.equipmentName
                    }
                  </td>

                  <td className="px-4 py-3">
                    {operator?.name}
                  </td>

                  <td className="px-4 py-3">
                    {
                      project?.projectName
                    }
                  </td>

                  <td className="px-4 py-3 text-right">
                    {log.startReading}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {log.endReading}
                  </td>

                  <td className="px-4 py-3 text-right font-medium">
                    {log.workingHours}
                  </td>

                </tr>

              );

            })}

          </tbody>

        </table>

      </div>

    </div>
  );
}