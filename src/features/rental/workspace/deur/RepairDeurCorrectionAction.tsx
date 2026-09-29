import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { DeurRecord } from "@/features/rental/deur/types";

export default function RepairDeurCorrectionAction({ deur }: { deur: DeurRecord }) {
  const { showToast } = useToast();
  const dependencies = useApplicationDependenciesCompatibility();
  const [busy, setBusy] = useState(false);
  const candidate = deur.creationSource === "MANUAL_WEB"
    && deur.status === "In Progress"
    && Boolean(deur.revision?.previousRevisionId);
  if (!candidate || dependencies.configuration.persistenceMode !== PersistenceMode.Remote
    || dependencies.configuration.remoteDeurCorrectionEnabled !== true
    || !dependencies.commandRepositories.deurRevisionCommands?.repairCorrectionPhysicalOccurrence) return null;

  async function repair() {
    if (busy) return;
    setBusy(true);
    try {
      const fresh = await dependencies.readRepositories.deurs.getById(deur.id);
      const expectedVersion = fresh.success && fresh.value
        ? Number((fresh.value as unknown as { rowVersion?: number }).rowVersion)
        : Number.NaN;
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        showToast("The corrected DEUR version could not be read. Refresh before retrying.", "error");
        return;
      }
      const result = await dependencies.commandRepositories.deurRevisionCommands.repairCorrectionPhysicalOccurrence({
        commandId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        deurId: deur.id,
        expectedVersion,
      });
      showToast(result.success ? "Correction timeline repaired from immutable source history." : result.message, result.success ? "success" : "error");
      if (result.success) window.location.reload();
    } catch {
      showToast("Confirmation was not received from the remote service. Refresh before retrying.", "error");
    } finally {
      setBusy(false);
    }
  }

  return <Button type="button" disabled={busy} onClick={() => void repair()}>{busy ? "Repairing correction timeline…" : "Repair Correction Timeline"}</Button>;
}
