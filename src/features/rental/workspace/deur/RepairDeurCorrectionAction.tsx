import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { OperationalCommandPhase } from "@/features/rental/operations/commands/contracts";

type RepairPhase = "READY" | "CLICK_RECEIVED" | "CONFIRMATION_ACCEPTED" | "REPOSITORY_INVOKED" | OperationalCommandPhase | "ACTION_COMPLETED";

export default function RepairDeurCorrectionAction({ deur }: { deur: DeurRecord }) {
  const { showToast } = useToast();
  const dependencies = useApplicationDependenciesCompatibility();
  const [busy, setBusy] = useState(false);
  const [phaseTrail, setPhaseTrail] = useState<RepairPhase[]>(["READY"]);
  const advance = (phase: RepairPhase) => setPhaseTrail((trail) => [...trail, phase]);
  const candidate = deur.creationSource === "MANUAL_WEB"
    && deur.status === "In Progress"
    && Boolean(deur.revision?.previousRevisionId);
  if (!candidate || dependencies.configuration.persistenceMode !== PersistenceMode.Remote
    || dependencies.configuration.remoteDeurCorrectionEnabled !== true
    || !dependencies.commandRepositories.deurRevisionCommands?.repairCorrectionPhysicalOccurrence) return null;

  async function repair() {
    if (busy) return;
    setBusy(true);
    advance("CLICK_RECEIVED");
    advance("CONFIRMATION_ACCEPTED");
    try {
      const fresh = await dependencies.readRepositories.deurs.getById(deur.id);
      const expectedVersion = fresh.success && fresh.value
        ? Number((fresh.value as unknown as { rowVersion?: number }).rowVersion)
        : Number.NaN;
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        showToast("The corrected DEUR version could not be read. Refresh before retrying.", "error");
        return;
      }
      advance("REPOSITORY_INVOKED");
      const result = await dependencies.commandRepositories.deurRevisionCommands.repairCorrectionPhysicalOccurrence({
        commandId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        deurId: deur.id,
        expectedVersion,
      }, (rpcPhase, elapsedMilliseconds) => {
        advance(rpcPhase);
        if (elapsedMilliseconds !== undefined) {
          setPhaseTrail((trail) => [...trail, `${rpcPhase}:${elapsedMilliseconds}ms` as RepairPhase]);
        }
      });
      showToast(result.success ? "Correction timeline repaired from immutable source history." : result.message, result.success ? "success" : "error");
      if (result.success) window.location.reload();
    } catch {
      showToast("Confirmation was not received from the remote service. Refresh before retrying.", "error");
    } finally {
      advance("ACTION_COMPLETED");
      setBusy(false);
    }
  }

  return <div>
    <Button type="button" disabled={busy} onClick={() => void repair()}>{busy ? "Repairing correction timeline…" : "Repair Correction Timeline"}</Button>
    <span aria-live="polite">Repair diagnostic phase: {phaseTrail[phaseTrail.length - 1]} (trail: {phaseTrail.join(" → ")})</span>
  </div>;
}
