import { useMemo, useRef, useState } from "react";

import {
  useRentalWorkspaceAggregate,
  useRentalWorkspacePresentationData,
} from "..";

import { getCompletedDeursForBillingPeriod } from "./BillingPreviewBuilder";

import { buildRentalLineAwareBillingPreview, createRentalLineAwareBillingStatement } from "@/features/rental/billingstatement/services/buildRentalLineAwareBilling";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { PersistenceMode } from "@/app/composition/ApplicationDependencies";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import { createCanonicalBillingStatement, type CanonicalBillingIdentity } from "./createCanonicalBillingStatement";

export function useBillingWizard() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const { showToast } = useToast();
  const dependencies = useApplicationDependenciesCompatibility();
  const { billingStatement, deur } = dependencies.repositories;
  const {equipment,operators}=useRentalWorkspacePresentationData();
  const { user } = useAuth();

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const [from, setFrom] =
    useState(today);

  const [to, setTo] =
    useState(today);

  const [generated, setGenerated] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const canonicalIdentity = useRef<CanonicalBillingIdentity | undefined>(undefined);

  const completedDeurs =
    useMemo(
      () => getCompletedDeursForBillingPeriod(
        aggregate.deurs,
        from,
        to
      ),
      [aggregate.deurs, from, to]
    );

  const previewResult =
    useMemo(() => {
      if (!generated) {
        return { lines: [], issues: [], notices: [], subtotal: 0, vat: 0, withholdingTax: 0, grandTotal: 0 };
      }
      return buildRentalLineAwareBillingPreview({ aggregate, from, to, equipment, operators });
    }, [
      aggregate,
      from,
      to,
      generated,
    ]);

  function generate() {
    setGenerated(true);
  }

  async function saveDraft() {

    if (!generated || saving) {
      return;
    }

    if (dependencies.configuration.persistenceMode === PersistenceMode.Remote) {
      const identity = canonicalIdentity.current ??= {
        statementId: crypto.randomUUID(),
        create: { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() },
        evidence: Object.fromEntries(previewResult.lines.map((line) => [line.deurId, { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }])),
        consumption: Object.fromEntries(previewResult.lines.map((line) => [line.deurId, { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), lineId: crypto.randomUUID() }])),
      };
      setSaving(true);
      try {
        const result = await createCanonicalBillingStatement({
          rentalId: aggregate.rental.id, from, to, currency: aggregate.contract?.currency ?? "PHP",
          preview: previewResult.lines, identity, repository: dependencies.commandRepositories.billingFinancialCommands,
        });
        if (!result.success) { showToast(result.message, "error"); return; }
        canonicalIdentity.current = undefined;
        requestCanonicalRentalRefresh();
        showToast("Billing statement created successfully.", "success");
      } catch {
        showToast("Confirmation was not received from the remote service. Refresh before retrying.", "error");
      } finally { setSaving(false); }
      return;
    }

    const result = createRentalLineAwareBillingStatement({ aggregate, from, to, equipment, operators, authenticatedUser: user }, { statements: billingStatement, deurs: deur });

    if (!result.success) {
      showToast(result.message, "error");
      return;
    }

    showToast("Billing statement created successfully.", "success");
  }

  return {

    from,

    to,

    setFrom,

    setTo,

    preview: previewResult.lines,

    issues: previewResult.issues,
    notices: previewResult.notices,

    totals: previewResult,

    completedDeurs,

    hasGenerated: generated,

    generate,

    saveDraft,

  };
}
