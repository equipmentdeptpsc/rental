import { useNavigate } from "react-router-dom";

import AssignmentForm from "./components/AssignmentForm";

import { useAssignment } from "./context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function NewAssignment() {
  const navigate = useNavigate();

  const { addAssignment } =
    useAssignment();

  const { updateStatus } =
    useEquipment();

  return (
    <AssignmentForm
      onSubmit={(data) => {
        const success =
          addAssignment({
            id: crypto.randomUUID(),
            equipmentId:
              data.equipmentId,
            operatorId:
              data.operatorId,
            projectId:
              data.projectId,
            assignedDate:
              new Date()
                .toISOString()
                .split("T")[0],
            expectedReturn:
              "",
            remarks:
              data.remarks,
            status: "Active",
          });

        if (!success) {
          alert(
            "Equipment or operator is already assigned."
          );

          return;
        }

        updateStatus(
          data.equipmentId,
          "Assigned"
        );

        navigate("/assignment");
      }}
    />
  );
}
