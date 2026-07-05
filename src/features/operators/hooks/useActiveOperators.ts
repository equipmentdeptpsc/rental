import { useMemo } from "react";

import { useOperator } from "../context/OperatorContext";

export function useActiveOperators() {
  const { operators } =
    useOperator();

  return useMemo(
    () =>
      operators.filter(
        (item) =>
          item.status ===
          "Active"
      ),
    [operators]
  );
}