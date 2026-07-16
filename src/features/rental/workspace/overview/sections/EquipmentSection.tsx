import EquipmentAssignmentCard from "../cards/EquipmentAssignmentCard";

import type {
  EquipmentAssignmentSummary,
} from "../types";

interface Props {
  equipment: EquipmentAssignmentSummary;
}

export default function EquipmentSection({
  equipment,
}: Props) {
  return (
    <EquipmentAssignmentCard
      equipment={equipment}
    />
  );
}