import type { RentalEquipmentLine } from "../equipment-line";

export type RentalWorkspaceEquipmentLineResolution =
  | { kind: "none" }
  | { kind: "sole"; line: RentalEquipmentLine }
  | { kind: "multiple"; lines: RentalEquipmentLine[] };

export function resolveRentalWorkspaceEquipmentLines(lines: RentalEquipmentLine[]): RentalWorkspaceEquipmentLineResolution {
  if (lines.length === 0) return { kind: "none" };
  if (lines.length === 1) return { kind: "sole", line: lines[0] };
  return { kind: "multiple", lines: structuredClone(lines) };
}
