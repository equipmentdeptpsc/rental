import EquipmentAssignmentCard from "../cards/EquipmentAssignmentCard";
import AddEquipmentPanel from "./AddEquipmentPanel";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import RentalLineLifecycleActions from "./RentalLineLifecycleActions";

import type {
  EquipmentAssignmentSummary,
} from "../types";

interface Props {
  equipment: EquipmentAssignmentSummary;
  rental?: RentalRecord;
  lines?: RentalEquipmentLine[];
  equipmentRecords?: EquipmentRecord[];
  assignments?: AssignmentRecord[];
}

export default function EquipmentSection({
  equipment,
  rental,
  lines,
  equipmentRecords,
  assignments,
}: Props) {
  const line = lines?.[0];
  return <div className="space-y-4"><EquipmentAssignmentCard equipment={equipment} />{rental && line && <RentalLineLifecycleActions rental={rental} line={line} equipmentLabel={equipment.assetNo} />}{rental && lines && equipmentRecords && assignments && <AddEquipmentPanel rental={rental} lines={lines} equipment={equipmentRecords} assignments={assignments} />}</div>;
}
