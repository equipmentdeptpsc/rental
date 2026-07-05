import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { useRental } from "@/features/rental/context/RentalContext";

import FleetStatusReport from "./fleet-status-report";
import AssignmentReport from "./assignment-report";
import RentalReport from "./rental-report";
import MaintenanceReport from "./maintenance-report";

export default function ReportsDashboard() {
  const { equipment } =
    useEquipment();

  const { assignments } =
    useAssignment();

  const { rentals } =
    useRental();

  const { maintenance } =
    useMaintenance();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Reports
        </h1>

        <p className="mt-2 text-gray-500">
          Operational reports for equipment,
          assignments, rentals and maintenance.
        </p>
      </div>

      <FleetStatusReport
        equipment={equipment}
      />

      <AssignmentReport
        assignments={assignments}
      />

      <RentalReport
        rentals={rentals}
      />

      <MaintenanceReport
        maintenance={maintenance}
      />
    </div>
  );
}