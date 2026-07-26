import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import { getRentalEquipmentLabel } from "@/features/rental/utils/rentalFormOptions";
import { useEffect, useState } from "react";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import { buildRentalDeurComplianceReport } from "@/features/rental/deur/compliance/buildRentalDeurComplianceReport";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import ApprovalInvalidationNotice from "@/features/rental/approval/ApprovalInvalidationNotice";

export default function RentalPage() {
  const { rentals } = useRental();

  const { getEquipment } =
    useEquipment();
  const { assignments } = useAssignment();
  const { operators } = useOperator();
  const { projects } = useProject();
  const [, setDeurVersion] = useState(0);
  useEffect(() => subscribeDeurChanges(() => setDeurVersion((value) => value + 1)), []);
  const { monitored: monitoredRentals, rows: attentionRows } = buildRentalDeurComplianceReport({ rentals, assignments, deurs: deurRepository.getAll(), evaluationTimestamp: new Date().toISOString(), liveShiftWindows: deurShiftWindowRepository.getAll() });

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Rental Transactions
          </h1>

          <p className="text-slate-500">
            Manage equipment rentals.
          </p>

        </div>

        <Link to="/rentals/new">

          <Button>

            New Rental

          </Button>

        </Link>

      </div>

      <ResponsiveTable><div className="rounded-lg border bg-white min-w-max">

        <table className="min-w-full">

          <thead className="bg-slate-50">

            <tr>

              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-left">
                Customer
              </th>

              <th className="px-4 py-3 text-left">
                Project
              </th>

              <th className="px-4 py-3 text-left">
                Date Out
              </th>

              <th className="px-4 py-3 text-left">
                Expected Return
              </th>

              <th className="px-4 py-3 text-left">
                Status
              </th>

              <th className="px-4 py-3 text-left">
                DEUR Compliance
              </th>

              <th className="px-4 py-3 text-left">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {rentals.length === 0 ? (

              <tr>

                <td
                  colSpan={8}
                  className="py-10 text-center text-slate-500"
                >
                  No rental transactions found.
                </td>

              </tr>

            ) : (

              rentals.map((rental) => {

                const equipment =
                  getEquipment(
                    rental.equipmentId
                  );

                return (

                  <tr
                    key={rental.id}
                    className="border-t"
                  >

                    <td className="px-4 py-3">

                      {getRentalEquipmentLabel(equipment)}

                    </td>

                    <td className="px-4 py-3">
                      {rental.customer}
                    </td>

                    <td className="px-4 py-3">
                      {rental.project}
                    </td>

                    <td className="px-4 py-3">
                      {rental.dateOut}
                    </td>

                    <td className="px-4 py-3">
                      {rental.expectedReturn}
                    </td>

                    <td className="px-4 py-3">

                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          rental.status ===
                          "Returned"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {rental.status}
                      </span>

                    </td>

                    <td className="px-4 py-3">
                      <RentalDeurComplianceIndicator result={monitoredRentals.find((item) => item.rental.id === rental.id)!.result} />
                    </td>

                    <td className="px-4 py-3">

                      <div className="flex gap-3">

                        <Link
                          to={`/rentals/${rental.id}/workspace`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Open Workspace
                        </Link>

                        <RentalQuickActions rental={rental} />

                      </div>
                      <ApprovalInvalidationNotice rental={rental} />

                    </td>

                  </tr>

                );

              })

            )}

          </tbody>

        </table>

      </div></ResponsiveTable>

      <section className="rounded-lg border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold">Rentals Missing DEUR</h2><p className="text-sm text-slate-500">Operational compliance only; no records or billing actions are generated.</p></div>
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">{attentionRows.length}</span>
        </div>
        <ResponsiveTable><table className="min-w-full text-sm">
          <thead className="bg-slate-50"><tr>{["Rental No.", "Work Date", "Shift", "Equipment", "Operator", "Project", "Billing Method", "Expectation Policy", "Status", "Existing DEUR", "Reason"].map((heading) => <th key={heading} className="px-3 py-2 text-left">{heading}</th>)}</tr></thead>
          <tbody>{attentionRows.length === 0 ? <tr><td colSpan={11} className="p-6 text-center text-slate-500">No rentals currently require DEUR attention.</td></tr> : attentionRows.map(({ rental, assignment, result, expectation }) => {
            const equipment = getEquipment(rental.equipmentId);
            const operator = operators.find((item) => item.id === (rental.operatorId ?? assignment?.operatorId));
            const project = projects.find((item) => item.id === rental.projectId);
            const policy = rental.deurExpectationPolicy;
            const policyLabel = policy?.frequency === "PER_WORKDAY" ? "Per Workday" : policy?.frequency === "PER_SHIFT" ? `Per Shift — ${policy.expectedShiftCodes?.join(", ")}` : policy?.frequency === "ON_DEMAND" ? "On Demand" : "Legacy Rental Fallback";
            return <tr key={expectation?.expectationId ?? rental.id} className="border-t">
              <td className="px-3 py-2"><Link className="text-blue-600 hover:underline" to={`/rentals/${rental.id}/workspace`}>{rental.rentalNumber ?? rental.id}</Link></td>
              <td className="px-3 py-2">{expectation?.workDate ?? "—"}</td><td className="px-3 py-2">{expectation?.shiftCode ?? "—"}</td>
              <td className="px-3 py-2">{getRentalEquipmentLabel(equipment)}</td><td className="px-3 py-2">{operator?.name ?? "Not assigned"}</td>
              <td className="px-3 py-2">{project?.projectName ?? rental.project}</td><td className="px-3 py-2">{rental.billingMethod ?? "Not configured"}</td>
              <td className="px-3 py-2">{policyLabel}</td><td className="px-3 py-2">{expectation?.status.replace("_", " ") ?? <RentalDeurComplianceIndicator result={result} />}</td>
              <td className="px-3 py-2">{expectation?.matchingDeurNumber ?? expectation?.matchingEffectiveDeurId ?? "—"}{expectation?.matchingRevisionNumber ? ` R${expectation.matchingRevisionNumber}` : ""}</td>
              <td className="px-3 py-2">{expectation?.reason ?? result.reason}</td>
            </tr>;
          })}</tbody>
        </table></ResponsiveTable>
      </section>

    </div>
  );
}
