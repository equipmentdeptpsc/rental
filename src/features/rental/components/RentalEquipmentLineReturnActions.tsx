import { useRef, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useAuth } from "@/features/auth/AuthContext";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import { toRentalEquipmentLineReturnTarget, type RentalEquipmentLine, type RentalEquipmentLineReturnTarget } from "@/features/rental/equipment-line";
import type { Operator } from "@/features/operators/types";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import { canUseCanonicalRemoteRentalReturnMutation } from "@/features/rental/services/rentalRuntimeCapability";
import { resolveRentalReturnBusinessDate } from "@/features/rental/services/resolveRentalReturnBusinessDate";
import type { RentalRecord } from "@/features/rental/types";

const terminal = new Set(["Returned", "Closed", "Cancelled"]);

export function isReturnableRentalEquipmentLine(line: RentalEquipmentLine) {
  return line.status === "Active";
}

export default function RentalEquipmentLineReturnActions({ rental, lines, equipment, assignments, operators }: {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  operators: Operator[];
}) {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [target, setTarget] = useState<(RentalEquipmentLine & RentalEquipmentLineReturnTarget)>();
  const [pending, setPending] = useState(false);
  const submissionPending = useRef(false);
  const identity = useRef<{ commandId: string; idempotencyKey: string } | undefined>(undefined);
  const enabled = canUseCanonicalRemoteRentalReturnMutation(configuration)
    && Boolean(commandRepositories.rentalReturnCommands)
    && hasPermission("rental.return")
    && rental.status === "Active";

  if (!enabled || lines.length === 0) return null;

  async function confirmReturn() {
    if (!target || submissionPending.current) return;
    const actualReturnDate = resolveRentalReturnBusinessDate(rental)?.value;
    if (!actualReturnDate) {
      setTarget(undefined);
      showToast("The authoritative Return business date could not be resolved. Refresh and try again.", "error");
      return;
    }
    if (typeof target.rowVersion !== "number") {
      setTarget(undefined);
      showToast("Rental Equipment Line version is unavailable. Refresh and try again.", "error");
      return;
    }
    const command = identity.current ??= { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const returnTarget = toRentalEquipmentLineReturnTarget(target);
    submissionPending.current = true;
    setPending(true);
    try {
      const result = await commandRepositories.rentalReturnCommands.returnLine({
        ...command,
        rentalId: rental.id,
        rentalLineId: returnTarget.rentalLineId,
        equipmentId: returnTarget.equipmentId,
        assignmentId: returnTarget.assignmentId,
        expectedVersion: returnTarget.rowVersion,
        actualReturnDate,
      });
      if (result.success) {
        identity.current = undefined;
        setTarget(undefined);
        requestCanonicalRentalRefresh();
      }
      showToast(result.success ? "Equipment line returned." : result.message, result.success ? "success" : "error");
    } catch {
      showToast("Confirmation was not received from the remote service. Refresh before retrying.", "error");
    } finally {
      submissionPending.current = false;
      setPending(false);
    }
  }

  return <section className="space-y-3 border-t pt-4" aria-label="Equipment return controls">
    <div><h3 className="font-semibold">Equipment return</h3><p className="text-sm text-slate-600">Return individual active equipment, or use Return All Equipment after its rental-level readiness check passes.</p></div>
    <div className="grid gap-3 md:grid-cols-2">
      {lines.map((line) => {
        const machine = equipment.find((item) => item.id === line.equipmentId);
        const assignment = assignments.find((item) => item.id === line.assignmentId);
        const operator = operators.find((item) => item.id === line.operatorId);
        const equipmentName = machine?.equipmentName?.trim();
        const equipmentCode = machine?.assetNo?.trim();
        const operatorName = operator?.name?.trim() || "Unassigned";
        const isTerminal = terminal.has(line.status);
        return <article key={line.id} className="rounded border p-3 text-sm">
          <dl className="space-y-1">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment Name</dt><dd className="font-medium">{equipmentName || equipmentCode || "Equipment information unavailable"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment Code</dt><dd>{equipmentCode || "Unavailable"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operator</dt><dd>{operatorName}</dd></div>
          </dl>
          <p className="mt-1 text-slate-600">Line status: {line.status}</p>
          <p className="text-slate-600">Assignment: {assignment?.status ?? (line.assignmentId ? "Unavailable" : "None")}</p>
          {line.actualReturnDate && <p className="text-slate-600">Actual return date: {line.actualReturnDate}</p>}
          {isReturnableRentalEquipmentLine(line) && <Button className="mt-3" size="sm" variant="secondary" disabled={pending} onClick={() => setTarget({ ...line, ...toRentalEquipmentLineReturnTarget(line) })}>{pending && target?.id === line.id ? "Working…" : "Return Equipment"}</Button>}
          {isTerminal && !line.actualReturnDate && <p className="mt-2 text-slate-500">No return action is available for this final line.</p>}
        </article>;
      })}
    </div>
    <ConfirmModal open={Boolean(target)} title="Confirm equipment return" message={target ? `Return ${equipment.find((item) => item.id === target.equipmentId)?.assetNo ?? "this equipment"}?` : ""} confirmText="Return Equipment" loading={pending} onConfirm={() => { void confirmReturn(); }} onCancel={() => setTarget(undefined)} />
  </section>;
}
