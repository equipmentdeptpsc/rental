import type { DeurRecord } from "@/features/rental/deur/types";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { submitDeur } from "@/features/rental/deur/services/reviewLifecycle";
import type { DeurOfflineCommandInput } from "./deurOfflineCommandGateway";

export function projectOfflineDeurCommand(
  command: DeurOfflineCommandInput,
  current: DeurRecord | undefined,
  actor: { id?: string; name: string; role?: string },
): DeurRecord | undefined {
  if (command.type === "DEUR_START_SHIFT") return structuredClone(command.input.draft);
  if (!current) return undefined;
  if (command.type === "DEUR_SUBMIT") {
    const result = submitDeur(current, actor, command.input.clientCreatedAt);
    return result.success ? structuredClone(result.record) : undefined;
  }
  const candidate = structuredClone(current);
  if (command.type === "DEUR_COMPLETE_SHIFT") {
    candidate.closingMeter = command.input.closingMeter;
    const result = applyDigitalDeurOperatorAction({
      deur: candidate,
      action: "END_SHIFT",
      actionTimestamp: command.input.clientCreatedAt ?? new Date().toISOString(),
      actor,
      meterRequirement: command.input.meterRequirement,
    });
    return result.success ? structuredClone(result.record) : undefined;
  }
  const result = applyDigitalDeurOperatorAction({
    deur: candidate,
    action: command.input.action,
    actionTimestamp: command.input.clientCreatedAt ?? new Date().toISOString(),
    actor,
  });
  return result.success ? structuredClone(result.record) : undefined;
}
