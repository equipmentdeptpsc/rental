import { useMemo, useState } from "react";

import { useToast } from "@/components/ui/toast/ToastContext";
import { updateBillingInvoiceStatus } from "@/features/rental/billingstatement/services/BillingStatementWorkflow";
import type { BillingInvoiceStatus } from "@/features/rental/billingstatement/types";
import { useRentalWorkspaceBillingStatements } from "..";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { recordCollection } from "@/features/rental/collections/collectionService";
import { useAuth } from "@/features/auth/AuthContext";

export function useBillingDrafts() {
  const workspaceStatements = useRentalWorkspaceBillingStatements();
  const { billingStatement: billingStatementRepository, deur: deurRepository } = useApplicationDependenciesCompatibility().repositories;
  const { showToast } = useToast();
  const { user, hasPermission } = useAuth();
  const [keyword, setKeyword] = useState("");
  const [version, setVersion] = useState(0);

  const drafts = useMemo(() => {
    const value = keyword.trim().toLowerCase();

    return workspaceStatements
      .filter((statement) => !value || [
        statement.statementNo,
        statement.customer,
        statement.project,
        statement.approvalStatus,
        statement.invoiceStatus,
      ].some((field) => field.toLowerCase().includes(value)));
  }, [keyword, version, workspaceStatements]);

  function refresh() {
    setVersion((value) => value + 1);
  }

  function deleteDraft(id: string) {
    if (!hasPermission("billing.update")) return;
    const confirmed = window.confirm("Delete this Billing Statement?");

    if (!confirmed) return;

    const deleted = billingStatementRepository.delete(id);

    if (!deleted) return;

    deurRepository.unlockBilling(deleted.id, user);
    refresh();
  }

  function updateInvoiceStatus(id: string, status: BillingInvoiceStatus) {
    const result = updateBillingInvoiceStatus(id, status, billingStatementRepository, user);

    if (!result.success) {
      showToast(result.message, "error");
      return;
    }
    billingStatementRepository.update({
      ...result.statement,
      invoiceStatusUpdatedAt: new Date().toISOString(),
      ...(user?.name ? { invoiceStatusUpdatedBy: user.name } : {}),
    });

    showToast("Invoice status updated.", "success");
    refresh();
  }

  function collect(id: string, input: { mode: "partial" | "full"; amount?: number; paymentDate: string; referenceNumber: string; paymentMethod?: string; remarks?: string }) {
    const result = recordCollection({ statementId: id, ...input, authenticatedUser: user, actor: { id: user?.id, name: user?.name ?? "Unknown user" } });
    if (!result.success) { showToast(result.message, "error"); return result; }
    showToast(input.mode === "full" ? "Remaining balance collected." : "Partial Collection recorded.", "success");
    refresh();
    return result;
  }

  return {
    drafts,
    keyword,
    setKeyword,
    refresh,
    deleteDraft,
    updateInvoiceStatus,
    collect,
  };
}
