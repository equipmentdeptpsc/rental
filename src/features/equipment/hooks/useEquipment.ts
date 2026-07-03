import { useState } from "react";
import { equipmentData, type EquipmentRecord } from "../data/equipment.mock";

export default function useEquipment() {
  const [equipment, setEquipment] = useState<EquipmentRecord[]>(equipmentData);

  return {
    equipment,
    setEquipment,
  };
}