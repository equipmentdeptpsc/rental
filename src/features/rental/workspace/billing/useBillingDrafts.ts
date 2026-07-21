import { useMemo, useState } from "react";

import { useToast } from "@/components/ui/toast/ToastContext";
import { updateBillingInvoiceStatus } from "@/features/rental/billingstatement/services/BillingStatementWorkflow";
import type { BillingInvoiceStatus } from "@/features/rental/billingstatement/types";
import { useRentalWorkspaceAggregate } from "..";
import { useApplicationDependenciesCompatibility } from "@/app/composition";

export function useBillingDrafts() {
  const aggregate = useRentalWorkspaceAggregate();
  const { billingStatement: billingStatementRepository, deur: deurRepository } = useApplicationDependenciesCompatibility().repositories;
  const { showToast } = useToast();
  const [keyword, setKeyword] = useState("");
  const [version, setVersion] = useState(0);

  const drafts = useMemo(() => {
    const value = keyword.trim().toLowerCase();

    return billingStatementRepository
      .getByRentalId(aggregate.rental.id)
      .filter((statement) => !value || [
        statement.statementNo,
        statement.customer,
        statement.project,
        statement.approvalStatus,
        statement.invoiceStatus,
      ].some((field) => field.toLowerCase().includes(value)));
  }, [aggregate, keyword, version, billingStatementRepository]);

  function refresh() {
    setVersion((value) => value + 1);
  }

  function deleteDraft(id: string) {
    const confirmed = window.confirm("Delete this Billing Statement?");

    if (!confirmed) return;

    const deleted = billingStatementRepository.delete(id);

    if (!deleted) return;

    deurRepository.unlockBilling(deleted.id);
    refresh();
  }

  function updateInvoiceStatus(id: string, status: BillingInvoiceStatus) {
    const result = updateBillingInvoiceStatus(id, status, billingStatementRepository);

    if (!result.success) {
      showToast(result.message, "error");
      return;
    }

    showToast("Invoice status updated.", "success");
  }

  return {
    drafts,
    keyword,
    setKeyword,
    refresh,
    deleteDraft,
    updateInvoiceStatus,
  };
}
