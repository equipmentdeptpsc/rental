import type { Operator } from "../types";

export function getOperatorName(
  operators: Operator[],
  id: string
) {
  return (
    operators.find(
      (o) => o.id === id
    )?.name ?? "-"
  );
}