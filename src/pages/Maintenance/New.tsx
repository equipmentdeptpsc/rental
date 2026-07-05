import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  useMaintenance,
} from "@/features/maintenance/context/MaintenanceContext";

import MaintenanceForm from "@/features/maintenance/components/MaintenanceForm";

import type {
  MaintenanceRecord,
} from "@/features/maintenance/types";

export default function NewMaintenance() {

  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const equipmentId =
    searchParams.get(
      "equipment"
    ) ?? "";

  const {
    addMaintenance,
  } =
    useMaintenance();

  return (
    <MaintenanceForm
      initialEquipmentId={
        equipmentId || undefined
      }
      lockEquipment={Boolean(
        equipmentId
      )}
      onSubmit={(data) => {

        const record: MaintenanceRecord = {

          id:
            crypto.randomUUID(),

          ...data,

          status:
            "Scheduled",

        };

        addMaintenance(
          record
        );

        navigate(
          "/maintenance"
        );

      }}
    />
  );

}