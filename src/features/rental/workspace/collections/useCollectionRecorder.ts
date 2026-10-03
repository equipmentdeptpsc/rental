import { useState } from "react";
import { useApplicationDependenciesCompatibility, PersistenceMode } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { notifyRentalWorkspaceChange } from "../workspaceRefresh";
import { useRentalWorkspaceAggregate, useRentalWorkspaceBillingStatements } from "..";
import { useCollectionSummary } from "./useCollectionSummary";

export function useCollectionRecorder() {
  const dependencies = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const aggregate = useRentalWorkspaceAggregate();
  const statements = useRentalWorkspaceBillingStatements();
  const summary = useCollectionSummary();
  const statement = statements.find((item) => ["Invoiced", "Partially Collected"].includes(item.invoiceStatus));
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const command = dependencies.commandRepositories.billingFinancialCommands.recordCollection;
  const available = dependencies.configuration.persistenceMode === PersistenceMode.Remote && Boolean(statement) && hasPermission("collections.create") && typeof command === "function";
  const submit = async () => {
    if (!statement || busy || !available) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > summary.outstanding || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !reference.trim()) {
      setMessage("Enter a valid amount, date, and unique reference within the outstanding balance."); return;
    }
    if (!window.confirm(`Record a PHP ${parsed.toFixed(2)} collection for ${statement.statementNo}?`)) return;
    setBusy(true); setMessage(undefined);
    try {
      const result = await command({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), statementId: statement.id, amount: parsed, paymentDate, reference: reference.trim(), expectedVersion: statement.version });
      if (result.success) { setMessage("Collection recorded."); setAmount(""); setReference(""); notifyRentalWorkspaceChange(aggregate.rental.id); }
      else setMessage(result.message);
    } catch { setMessage("Collection could not be recorded. Reconcile before retrying."); }
    finally { setBusy(false); }
  };
  return { available, amount, setAmount, paymentDate, setPaymentDate, reference, setReference, busy, message, submit };
}
