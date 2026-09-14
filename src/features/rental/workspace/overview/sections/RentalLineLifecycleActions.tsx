import { useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import {
  canUseCanonicalRemoteRentalLineActivateMutation,
  canUseCanonicalRemoteRentalLineCancelMutation,
  canUseCanonicalRemoteRentalLineReleaseMutation,
  canUseCanonicalRemoteRentalLineReserveMutation,
  canUseCanonicalRemoteRentalLineReturnMutation,
} from "@/features/rental/services/rentalRuntimeCapability";
import type { RentalRecord } from "@/features/rental/types";

interface Props { rental: RentalRecord; line: RentalEquipmentLine; equipmentLabel: string }
const parentReadOnly = new Set(["Cancelled", "Closed", "Returned"]);

export default function RentalLineLifecycleActions({ rental, line, equipmentLabel }: Props) {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const status = line.canonicalLineStatus ?? line.status;
  const repository = commandRepositories.rentalLineLifecycleCommands;
  if (parentReadOnly.has(rental.status)) return <div className="mt-3 text-xs text-slate-500">Parent Rental Status: {rental.status}. Equipment line actions are read-only.</div>;

  const run = async (action: "reserve" | "release" | "activate" | "cancel" | "return") => {
    if (busy) return;
    setBusy(true);
    try {
      const identity = { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
      const input = { ...identity, rentalId: rental.id, rentalLineId: line.id };
      const result = action === "reserve" ? await repository?.reserveLine?.(input)
        : action === "release" ? await repository?.releaseLine?.(input)
        : action === "activate" ? await repository?.activateLine?.(input)
        : action === "cancel" ? await repository?.cancelLine?.(input)
        : returnDate ? await repository?.returnLine?.({ ...input, equipmentId: line.equipmentId, ...(line.assignmentId ? { assignmentId: line.assignmentId } : {}), actualReturnDate: returnDate }) : undefined;
      if (!result) return;
      setMessage(result.success ? `${equipmentLabel}: ${result.value.status}.` : result.message);
      if (result.success) requestCanonicalRentalRefresh();
    } finally {
      setBusy(false);
    }
  };
  const actions = [
    status === "Draft" && canUseCanonicalRemoteRentalLineReserveMutation(configuration) && hasPermission("rental.update") && repository?.reserveLine ? ["Reserve Equipment", "reserve"] as const : undefined,
    ["Draft", "Reserved", "Released"].includes(status) && canUseCanonicalRemoteRentalLineCancelMutation(configuration) && hasPermission("rental.update") && repository?.cancelLine ? ["Cancel Equipment", "cancel"] as const : undefined,
    status === "Reserved" && canUseCanonicalRemoteRentalLineReleaseMutation(configuration) && hasPermission("rental.release") && repository?.releaseLine ? ["Release Equipment", "release"] as const : undefined,
    status === "Released" && canUseCanonicalRemoteRentalLineActivateMutation(configuration) && hasPermission("rental.activate") && repository?.activateLine ? ["Activate Equipment", "activate"] as const : undefined,
  ].filter(Boolean) as Array<readonly [string, "reserve" | "release" | "activate" | "cancel"]>;
  const mayReturn = status === "Active" && canUseCanonicalRemoteRentalLineReturnMutation(configuration) && hasPermission("rental.return") && repository?.returnLine;
  if (!actions.length && !mayReturn) return <div className="mt-3 text-xs text-slate-500">Parent Rental Status: {rental.status} · Equipment Line Status: {status}</div>;
  return <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-600">Parent Rental Status: {rental.status} · Equipment Line Status: {status}</p><div className="flex flex-wrap gap-2">{actions.map(([label, action]) => <button key={action} type="button" disabled={busy} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50" onClick={() => void run(action)}>{label}</button>)}</div>{mayReturn && <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-sm">Return date<input aria-label={`Return date for ${equipmentLabel}`} type="date" min={rental.dateOut} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} className="rounded border bg-white p-2" /></label><button type="button" disabled={busy || !returnDate} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50" onClick={() => void run("return")}>Return Equipment</button></div>}{message && <p role="status" className="text-sm text-slate-700">{message}</p>}</div>;
}
