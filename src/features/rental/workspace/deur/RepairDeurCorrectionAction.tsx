import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { OperationalCommandPhase, OperationalCommandTransportDiagnostic } from "@/features/rental/operations/commands/contracts";

type RepairPhase = "READY" | "CLICK_RECEIVED" | "CONFIRMATION_ACCEPTED" | "REPOSITORY_INVOKED" | OperationalCommandPhase | "ACTION_COMPLETED";
type RepairProbePhase = "PROBE_READY" | "POINTER_DOWN_CAPTURE" | "POINTER_DOWN" | "MOUSE_DOWN_CAPTURE" | "MOUSE_DOWN" | "CLICK_CAPTURE" | "CLICK_HANDLER_ENTERED" | "KEY_DOWN_ENTER" | "KEY_DOWN_SPACE" | "PROBE_COMPLETED";

export default function RepairDeurCorrectionAction({ deur }: { deur: DeurRecord }) {
  const { showToast } = useToast();
  const dependencies = useApplicationDependenciesCompatibility();
  const [busy, setBusy] = useState(false);
  const [phaseTrail, setPhaseTrail] = useState<RepairPhase[]>(["READY"]);
  const [transportDiagnostic, setTransportDiagnostic] = useState<OperationalCommandTransportDiagnostic>();
  const [probeTrail, setProbeTrail] = useState<RepairProbePhase[]>([]);
  const probeSequence = useRef(0);
  const renderGeneration = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const probeMode = typeof window !== "undefined"
    && /(^|\.)uat\.pscequipment\.online$/.test(window.location.hostname)
    && new URLSearchParams(window.location.search).get("repairProbe") === "1";
  renderGeneration.current += 1;
  const advance = (phase: RepairPhase) => setPhaseTrail((trail) => [...trail, phase]);
  const recordProbe = (phase: RepairProbePhase) => {
    probeSequence.current += 1;
    setProbeTrail((trail) => [...trail, phase]);
  };
  useEffect(() => {
    if (!probeMode) return;
    recordProbe("PROBE_READY");
    return () => { console.debug("UAT repair probe unmounted", { renderGeneration: renderGeneration.current }); };
  }, [probeMode]);
  const candidate = deur.creationSource === "MANUAL_WEB"
    && deur.status === "In Progress"
    && Boolean(deur.revision?.previousRevisionId);
  if (!candidate || dependencies.configuration.persistenceMode !== PersistenceMode.Remote
    || dependencies.configuration.remoteDeurCorrectionEnabled !== true
    || !dependencies.commandRepositories.deurRevisionCommands?.repairCorrectionPhysicalOccurrence) return null;

  async function repair() {
    if (busy) return;
    setBusy(true);
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
      }, (rpcPhase, elapsedMilliseconds, diagnostic) => {
        advance(rpcPhase);
        if (rpcPhase === "RPC_ERROR_RECEIVED") setTransportDiagnostic(diagnostic);
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

  const handleClick = () => {
    if (probeMode) {
      recordProbe("CLICK_HANDLER_ENTERED");
      recordProbe("PROBE_COMPLETED");
      return;
    }
    advance("CLICK_RECEIVED");
    void repair();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!probeMode) return;
    if (event.key === "Enter") recordProbe("KEY_DOWN_ENTER");
    if (event.key === " ") recordProbe("KEY_DOWN_SPACE");
  };

  return <div
    data-uat-repair-probe={probeMode ? "enabled" : undefined}
    onPointerDownCapture={() => probeMode && recordProbe("POINTER_DOWN_CAPTURE")}
    onMouseDownCapture={() => probeMode && recordProbe("MOUSE_DOWN_CAPTURE")}
    onClickCapture={() => probeMode && recordProbe("CLICK_CAPTURE")}
  >
    <Button
      ref={buttonRef}
      type="button"
      disabled={busy}
      onPointerDown={() => probeMode && recordProbe("POINTER_DOWN")}
      onMouseDown={() => probeMode && recordProbe("MOUSE_DOWN")}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    >{busy ? "Repairing correction timeline…" : "Repair Correction Timeline"}</Button>
    <span aria-live="polite">Repair diagnostic phase: {phaseTrail[phaseTrail.length - 1]} (trail: {phaseTrail.join(" → ")})</span>
    {probeMode && <div role="status" aria-label="Repair UI probe diagnostic">
      <span>Repair UI probe mode: ENABLED (no mutation)</span>
      <span>Probe trail: {probeTrail.join(" → ") || "PROBE_READY"}</span>
      <span>Event sequence: {probeSequence.current}</span>
      <span>Render generation: {renderGeneration.current}</span>
      <span>Button DOM identity: {buttonRef.current ? "present" : "missing"}</span>
      <span>Busy: {busy ? "YES" : "NO"}</span>
      <span>Eligible: YES</span>
      <span>Status: {deur.status}</span>
    </div>}
    {transportDiagnostic && <div role="status" aria-label="Repair transport diagnostic">
      <span>RPC: command_repair_manual_deur_correction_physical_occurrence</span>
      <span>Schema: erp</span>
      {transportDiagnostic.code && <span>PostgREST code: {transportDiagnostic.code}</span>}
      {transportDiagnostic.message && <span>PostgREST message: {transportDiagnostic.message}</span>}
      {transportDiagnostic.details && <span>PostgREST details: {transportDiagnostic.details}</span>}
      {transportDiagnostic.hint && <span>PostgREST hint: {transportDiagnostic.hint}</span>}
      {transportDiagnostic.status !== undefined && <span>HTTP status: {transportDiagnostic.status}</span>}
    </div>}
  </div>;
}
