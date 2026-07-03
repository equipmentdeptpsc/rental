import { useNavigate } from "react-router-dom";

import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";

import MaintenanceForm from "@/features/maintenance/components/MaintenanceForm";

export default function NewMaintenance() {
  const navigate = useNavigate();

  const { addMaintenance } =
    useMaintenance();

  return (
    <MaintenanceForm
      onSubmit={(data) => {
        addMaintenance({
          id: crypto.randomUUID(),
          ...data,
        });

        navigate("/maintenance");
      }}
    />
  );
}