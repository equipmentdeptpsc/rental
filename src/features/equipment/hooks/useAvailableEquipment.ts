import { useMemo } from "react";

import { useEquipment } from "../context/EquipmentContext";

export function useAvailableEquipment() {
  const { equipment } =
    useEquipment();

  return useMemo(
    () =>
      equipment.filter(
        (item) =>
          item.status ===
          "Available"
      ),
    [equipment]
  );
}