import {
  useParams,
} from "react-router-dom";

import {
  useEquipment,
} from "@/features/equipment/context/EquipmentContext";

import {
  useProject,
} from "@/features/project/context/ProjectContext";

import {
  useOperator,
} from "@/features/operators/context/OperatorContext";

import EquipmentTimeline from "@/features/equipment/history/components/EquipmentTimeline";

export default function EquipmentDetails() {
  const { id } =
    useParams();

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

  return (
    <div className="p-8 space-y-8">

      <div className="rounded-lg border bg-white p-6">

        <h1 className="text-3xl font-bold">
          {equipment.equipmentName}
        </h1>

        <div className="grid grid-cols-2 gap-6 mt-6">

          <div>
            <strong>
              Asset No
            </strong>

            <div>
              {
                equipment.assetNo
              }
            </div>
          </div>

          <div>
            <strong>
              Status
            </strong>

            <div>
              {
                equipment.status
              }
            </div>
          </div>

          <div>
            <strong>
              Project
            </strong>

            <div>
              {project
                ?.projectName ??
                "-"}
            </div>
          </div>

          <div>
            <strong>
              Operator
            </strong>

            <div>
              {operator
                ?.name ?? "-"}
            </div>
          </div>

          <div>
            <strong>
              Current Reading
            </strong>

            <div>
              {
                equipment.currentReading
              }
            </div>
          </div>

          <div>
            <strong>
              Tracking
            </strong>

            <div>
              {
                equipment.maintenanceType
              }
            </div>
          </div>

        </div>

      </div>

      <EquipmentTimeline
        equipmentId={
          equipment.id
        }
      />

    </div>
  );
}