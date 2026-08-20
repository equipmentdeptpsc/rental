import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import ApprovalInvalidationNotice from "@/features/rental/approval/ApprovalInvalidationNotice";
import { resolveRentalTransactionPresentation } from "@/features/rental/services/resolveRentalTransactionPresentation";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { DeurRecord } from "@/features/rental/deur/types";

export function RentalMobileCard({
  rental,
  presentation,
  workflowLabel,
  collectionStatus,
  compliance,
}: {
  rental: RentalRecord;
  presentation: ReturnType<typeof resolveRentalTransactionPresentation>;
  workflowLabel: string;
  collectionStatus: string;
  compliance: React.ReactNode;
}) {
  return (
    <article className="app-card space-y-3 p-4 lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{presentation.equipmentLabel}</p>
          <p className="text-xs text-slate-500">{presentation.operatorLabel}</p>
          <p className="mt-1 text-sm">{rental.customer} · {rental.project}</p>
        </div>
        <StatusBadge tone={rental.status === "Returned" ? "success" : "info"}>{rental.status}</StatusBadge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-slate-500">Date Out</dt><dd>{rental.dateOut}</dd></div>
        <div><dt className="text-slate-500">Expected Return</dt><dd>{rental.expectedReturn}</dd></div>
        <div><dt className="text-slate-500">Workflow</dt><dd>{workflowLabel}</dd></div>
        <div><dt className="text-slate-500">Collection</dt><dd>{collectionStatus}</dd></div>
      </dl>
      <div>{compliance}</div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/rentals/${rental.id}/workspace`}><Button size="sm">Open Workspace</Button></Link>
        <RentalQuickActions rental={rental} />
      </div>
      <ApprovalInvalidationNotice rental={rental} />
    </article>
  );
}

export function buildRentalRowModel(input: {
  rental: RentalRecord;
  rentalEquipmentLines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  operators: Operator[];
  deurs: DeurRecord[];
  monitoredResult: { rental: RentalRecord; result: Parameters<typeof RentalDeurComplianceIndicator>[0]["result"] } | undefined;
  collectionStatus: string;
  workflowLabel: string;
}) {
  const presentation = resolveRentalTransactionPresentation({
    rental: input.rental,
    lines: input.rentalEquipmentLines,
    equipment: input.equipment,
    operators: input.operators,
  });
  return { presentation, collectionStatus: input.collectionStatus, workflowLabel: input.workflowLabel, compliance: input.monitoredResult };
}

export function resolveRentalWorkflowLabel(input: {
  rental: RentalRecord;
  rentalEquipmentLines: RentalEquipmentLine[];
  deurs: DeurRecord[];
  commercialTermsAvailable: boolean;
  billableEvidence: boolean;
}) {
  const effectiveDeur = input.deurs.at(-1);
  return resolveRentalWorkflowStatus({
    rental: input.rental,
    effectiveDeur,
    commercialTermsAvailable: input.commercialTermsAvailable,
    billableEvidence: input.billableEvidence,
  }).label;
}
