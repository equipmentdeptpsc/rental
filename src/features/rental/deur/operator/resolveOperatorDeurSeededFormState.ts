import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import type { DeurShiftWindowDefinition, RentalLineDeurExpectationSnapshot } from "@/features/rental/types";
import type { DeurRecord } from "../types";

export function resolveOperatorDeurSeededFormState(input: {
  snapshot?: RentalLineDeurExpectationSnapshot;
  workDescriptions: readonly WorkDescriptionRecord[];
  fallbackWindows?: readonly DeurShiftWindowDefinition[];
}) {
  const options = input.workDescriptions.filter((item) => item.active && !item.deleted);
  const workDescriptionId = input.snapshot?.workDescription.id && options.some((item) => item.id === input.snapshot?.workDescription.id)
    ? input.snapshot.workDescription.id
    : "";
  const policyCodes = input.snapshot?.policy.expectedShiftCodes ?? [];
  const windows = (input.snapshot?.shiftWindows.length ? input.snapshot.shiftWindows : input.fallbackWindows ?? [])
    .filter((item) => !policyCodes.length || policyCodes.includes(item.code));
  const firstCode = policyCodes[0] ?? windows[0]?.code;
  const shift: DeurRecord["shift"] = firstCode === "NIGHT" ? "Night" : firstCode === "DAY" ? "Day" : undefined;
  return { workDescriptionId, shift, windows, valid: Boolean(workDescriptionId) };
}
