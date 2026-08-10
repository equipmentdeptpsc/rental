import { Link, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { useDailyLog } from "@/features/daily-log";

import EquipmentTimeline from "@/features/equipment/history/components/EquipmentTimeline";
import { useCostCodes } from "@/features/masters/cost-code/context/useCostCodes";
import { getEquipmentCostCodeDisplay } from "@/features/equipment/utils/equipmentCostCode";
import { presentEquipmentStatus } from "@/features/equipment/utils/equipmentStatusPresentation";
import { validateEquipmentAssignment } from "@/features/assignment/utils/assignmentValidation";

export default function EquipmentDetails() {
  const { id } = useParams();

  const { getEquipment } =
    useEquipment();

  const equipment =
    id
      ? getEquipment(id)
      : undefined;

  const { projects } =
    useProject();

  const { operators } =
    useOperator();

  const {
    assignments,
    activeAssignments,
  } = useAssignment();

  const { rentals } =
    useRental();

  const { maintenance } =
    useMaintenance();

  const { logs } =
    useDailyLog();

  const { costCodes } = useCostCodes();

  if (!equipment) {
    return (
      <div className="p-8">
        Equipment not found.
      </div>
    );
  }

  const project =
    projects.find(
      (p) =>
        p.id ===
        equipment.projectId
    );

  const operator =
    operators.find(
      (o) =>
        o.id ===
        equipment.operatorId
    );

  const currentAssignment =
    activeAssignments.find(
      (a) =>
        a.equipmentId ===
        equipment.id
    );

  const activeRental =
    rentals.find(
      (r) =>
        r.equipmentId ===
          equipment.id &&
        r.status ===
          "Active"
    );

  const equipmentLogs =
    logs.filter(
      (l) =>
        l.equipmentId ===
        equipment.id
    );

  const maintenanceHistory =
    maintenance.filter(
      (m) =>
        m.equipmentId ===
        equipment.id
    );

  const assignmentHistory =
    assignments.filter(
      (a) =>
        a.equipmentId ===
        equipment.id
    );

  const rentalHistory =
    rentals.filter(
      (r) =>
        r.equipmentId ===
        equipment.id
    );

  const totalWorkingHours =
    equipmentLogs.reduce(
      (sum, log) =>
        sum +
        log.workingHours,
      0
    );

  const totalAssignments =
    assignmentHistory.length;

  const totalRentals =
    rentalHistory.length;

  const totalMaintenance =
    maintenanceHistory.length;

  const costCode = getEquipmentCostCodeDisplay(
    equipment.costCodeId,
    costCodes,
  );
  const assignmentEligibility = validateEquipmentAssignment(equipment);

  return (
    <div className="space-y-8 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            {equipment.equipmentName}
          </h1>

          <div className="grid grid-cols-2 gap-4">

  <div>

    <div className="text-xs text-slate-500">
      Manufacturer
    </div>

    <div className="font-medium">
      {equipment.manufacturer || "-"}
    </div>

  </div>

  <div>

    <div className="text-xs text-slate-500">
      Model
    </div>

    <div className="font-medium">
      {equipment.model || "-"}
    </div>

  </div>

</div>

<div className="grid grid-cols-2 gap-4">

  <div>

  <div className="grid grid-cols-2 gap-4">

<div>
  <div className="text-xs text-slate-500">
    Serial Number
  </div>

  <div className="font-medium">
    {equipment.serialNumber || "-"}
  </div>
</div>

<div>
  <div className="text-xs text-slate-500">
    Plate Number
  </div>

  <div className="font-medium">
    {equipment.plateNumber || "-"}
  </div>
</div>

</div>

<div className="grid grid-cols-2 gap-4">

<div>
  <div className="text-xs text-slate-500">
    Engine Number
  </div>

  <div className="font-medium">
    {equipment.engineNumber || "-"}
  </div>
</div>

<div>
  <div className="text-xs text-slate-500">
    Chassis Number
  </div>

  <div className="font-medium">
    {equipment.chassisNumber || "-"}
  </div>
</div>

</div>

    <div className="text-xs text-slate-500">
      Year Model
    </div>

    <div className="font-medium">
      {equipment.yearModel ?? "-"}
    </div>

  </div>

  <div>

    <div className="text-xs text-slate-500">
      Capacity
    </div>

    <div className="font-medium">
      {equipment.capacity || "-"}
    </div>

  </div>

</div>

          <p className="mt-1 text-gray-500">
            Asset No.
            {" "}
            {equipment.assetNo}
          </p>

        </div>

        <div className="flex flex-wrap gap-2">

          {assignmentEligibility.valid ? <Link to={`/assignments/new?equipment=${equipment.id}`}><Button>Assign</Button></Link> : <span title={assignmentEligibility.message}><Button disabled>Assign</Button></span>}

          <Link
            to={`/rentals/new?equipment=${equipment.id}`}
          >
            <Button>
              Rent
            </Button>
          </Link>

          <Link
            to={`/maintenance/new?equipment=${equipment.id}`}
          >
            <Button>
              Maintenance
            </Button>
          </Link>

          <Link
            to={`/daily-logs/new?equipment=${equipment.id}`}
          >
            <Button>
              Daily Log
            </Button>
          </Link>

        </div>

      </div>

      <div className="grid gap-4 md:grid-cols-4">

        <div className="rounded-xl border bg-white p-5">

          <div className="text-sm text-gray-500">
            Status
          </div>

          <div className="mt-2 text-2xl font-bold">
            {presentEquipmentStatus(equipment.status)}
          </div>

        </div>

        <div className="rounded-xl border bg-white p-5">

          <div className="text-sm text-gray-500">
            Current Reading
          </div>

          <div className="mt-2 text-2xl font-bold">
            {equipment.currentReading}
          </div>

        </div>

        <div className="rounded-xl border bg-white p-5">

          <div className="text-sm text-gray-500">
            Total Usage
          </div>

          <div className="mt-2 text-2xl font-bold">
            {totalWorkingHours}
          </div>

        </div>

        <div className="rounded-xl border bg-white p-5">

          <div className="text-sm text-gray-500">
            Daily Logs
          </div>

          <div className="mt-2 text-2xl font-bold">
            {equipmentLogs.length}
          </div>

        </div>

      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        <div className="rounded-xl border bg-white p-6">

          <h2 className="mb-4 text-xl font-semibold">
            Equipment Information
          </h2>

          <div className="space-y-3">

            <div>

              <strong>
                Cost Code:
              </strong>
              {costCode.configured ? (
                <div className="mt-1">
                  <div className="font-medium">{costCode.code}</div>
                  <div className="text-sm text-slate-500">{costCode.name}</div>
                </div>
              ) : (
                <div className="mt-1 text-amber-700">{costCode.warning}</div>
              )}

            </div>

            <div>

              <strong>
                Project:
              </strong>
              {" "}
              {project?.projectName ??
                "-"}

            </div>

            <div>

              <strong>
                Operator:
              </strong>
              {" "}
              {operator?.name ??
                "-"}

            </div>

            <div>

              <strong>
                Tracking:
              </strong>
              {" "}
              {
                equipment.maintenanceType
              }

            </div>

            <div>

              <strong>
                Current Assignment:
              </strong>
              {" "}

              {currentAssignment
                ? "Active"
                : "None"}

            </div>

            <div>

              <strong>
                Current Rental:
              </strong>
              {" "}

              {activeRental
                ? "Active"
                : "Available"}

            </div>

          </div>

        </div>

        <div className="rounded-xl border bg-white p-6">

          <h2 className="mb-4 text-xl font-semibold">
            Fleet Statistics
          </h2>

          <div className="space-y-3">

            <div>

              Total Assignments:
              {" "}
              {totalAssignments}

            </div>

            <div>

              Total Rentals:
              {" "}
              {totalRentals}

            </div>

            <div>

              Maintenance Records:
              {" "}
              {totalMaintenance}

            </div>

            <div>

              Daily Logs:
              {" "}
              {equipmentLogs.length}

            </div>

          </div>

        </div>

      </div>

      <div className="rounded-xl border bg-white p-6">

        <h2 className="mb-4 text-xl font-semibold">
          Maintenance Status
        </h2>

        {maintenanceHistory.length ===
        0 ? (

          <div className="rounded bg-yellow-100 p-4">

            No maintenance history.

          </div>

        ) : (

          <div className="space-y-2">

            <div>

              Latest Record:
              {" "}
              {
                maintenanceHistory[
                  maintenanceHistory.length -
                    1
                ].scheduledDate
              }

            </div>

            <div>

              Total Maintenance:
              {" "}
              {maintenanceHistory.length}

            </div>

          </div>

        )}

      </div>

      <div className="rounded-xl border bg-white p-6">

        <h2 className="mb-4 text-xl font-semibold">
          Recent Daily Logs
        </h2>

        {equipmentLogs.length ===
        0 ? (

          <div className="text-gray-500">

            No daily logs available.

          </div>

        ) : (

          <table className="min-w-full">

            <thead>

              <tr className="border-b">

                <th className="py-2 text-left">
                  Date
                </th>

                <th className="py-2 text-right">
                  Start
                </th>

                <th className="py-2 text-right">
                  End
                </th>

                <th className="py-2 text-right">
                  Hours
                </th>

              </tr>

            </thead>

            <tbody>

              {equipmentLogs
                .slice()
                .reverse()
                .slice(0, 5)
                .map((log) => (

                  <tr
                    key={log.id}
                    className="border-b"
                  >

                    <td className="py-2">
                      {log.date}
                    </td>

                    <td className="py-2 text-right">
                      {
                        log.startReading
                      }
                    </td>

                    <td className="py-2 text-right">
                      {log.endReading}
                    </td>

                    <td className="py-2 text-right">
                      {
                        log.workingHours
                      }
                    </td>

                  </tr>

                ))}

            </tbody>

          </table>

        )}

      </div>

      <div className="rounded-xl border bg-white p-6">

        <h2 className="mb-4 text-xl font-semibold">
          Equipment Timeline
        </h2>

        <EquipmentTimeline
          equipmentId={
            equipment.id
          }
        />

      </div>

    </div>
  );
}
