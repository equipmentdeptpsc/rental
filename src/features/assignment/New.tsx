import { useNavigate } from "react-router-dom";

import AssignmentForm from "@/features/assignment/components/AssignmentForm";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function NewAssignment() {
  const navigate =
    useNavigate();

  const {
    addAssignment,
  } = useAssignment();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-8">
        New Assignment
      </h1>

      <AssignmentForm
        onSubmit={(
          data
        ) => {
          addAssignment({
            id: crypto.randomUUID(),
            ...data,
            assignedDate:
              new Date()
                .toISOString()
                .split("T")[0],
            status: "Active",
          });

          const machine =
            equipment.find(
              (e) =>
                e.id ===
                data.equipmentId
            );

          if (machine) {
            updateEquipment({
              ...machine,
              status:
                "Assigned",
            });
          }

          navigate(
            "/assignments"
          );
        }}
      />

    </div>
  );
}