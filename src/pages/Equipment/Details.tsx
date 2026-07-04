import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

function Info({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-semibold">
        {value}
      </div>
    </div>
  );
}

export default function EquipmentDetails() {
  const navigate = useNavigate();

  const { id } = useParams();

  const { equipment } = useEquipment();

  const { projects } = useProject();

  const { operators } = useOperator();

  const machine = equipment.find(
    (e) => e.id === id
  );

  if (!machine) {
    return (
      <div className="p-8">
        Equipment not found.
      </div>
    );
  }

  const project =
    projects.find(
      (p) => p.id === machine.projectId
    )?.projectName ?? "-";

  const operator =
    operators.find(
      (o) => o.id === machine.operatorId
    )?.name ?? "-";

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Equipment Details
          </h1>

          <p className="text-slate-500">
            {machine.assetNo}
          </p>

        </div>

        <Button
          onClick={() =>
            navigate(
              `/equipment/edit/${machine.id}`
            )
          }
        >
          Edit
        </Button>

      </div>

      <div className="grid gap-4 md:grid-cols-2">

        <Info
          label="Asset No"
          value={machine.assetNo}
        />

        <Info
          label="Equipment"
          value={machine.equipmentName}
        />

        <Info
          label="Category"
          value={machine.category}
        />

        <Info
          label="Tracking"
          value={machine.maintenanceType}
        />

        <Info
          label="Current Reading"
          value={machine.currentReading}
        />

        <Info
          label="Status"
          value={machine.status}
        />

        <Info
          label="Project"
          value={project}
        />

        <Info
          label="Operator"
          value={operator}
        />

      </div>

    </div>
  );
}