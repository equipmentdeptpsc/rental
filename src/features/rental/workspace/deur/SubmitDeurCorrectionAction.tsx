import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useApplicationDependenciesCompatibility, PersistenceMode } from "@/app/composition";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { ManualDeurCommandRepository } from "@/features/rental/deur/commands/contracts";

export default function SubmitDeurCorrectionAction({ deur }: { deur: DeurRecord }) {
  const { showToast } = useToast();
  const dependencies = useApplicationDependenciesCompatibility();
  const [busy, setBusy] = useState(false);
  const isCorrection = deur.creationSource === "MANUAL_WEB" && deur.status === "In Progress" && Boolean(deur.revision?.previousRevisionId);
  if (!isCorrection || dependencies.configuration.persistenceMode !== PersistenceMode.Remote) return null;

  async function submit() {
    if (busy) return;
    setBusy(true);
    const fresh = await dependencies.readRepositories.deurs.getById(deur.id);
    const expectedVersion = fresh.success && fresh.value
      ? Number((fresh.value as unknown as { rowVersion?: number }).rowVersion)
      : Number.NaN;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      setBusy(false);
      showToast("The corrected DEUR version could not be read. Refresh before retrying.", "error");
      return;
    }
    const repository = dependencies.commandRepositories.deurCommands as unknown as ManualDeurCommandRepository;
    const result = await repository.submitManualDeur({
      commandId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      deurId: deur.id,
      expectedVersion,
    });
    setBusy(false);
    if (!result.success) {
      showToast(result.message, "error");
      return;
    }
    showToast("Corrected DEUR submitted for customer review.", "success");
    window.location.reload();
  }

  return <Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting corrected revision…" : "Submit Corrected Revision"}</Button>;
}
