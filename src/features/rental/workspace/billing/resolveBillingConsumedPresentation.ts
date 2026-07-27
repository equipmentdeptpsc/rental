import type { RentalAggregate } from "@/features/rental/aggregate";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { EquipmentRecord } from "@/features/equipment/types";

export interface BillingConsumedNotice {
  code: "ALREADY_BILLED";
  label: string;
  message: string;
}

export function resolveBillingConsumedPresentation(input: {
  aggregate: RentalAggregate;
  deur: DeurRecord;
  equipment?: EquipmentRecord[];
  statements?: BillingStatement[];
}): BillingConsumedNotice {
  const { aggregate, deur } = input;
  const lineIndex = aggregate.rentalEquipmentLines.findIndex((line) =>
    deur.rentalEquipmentLineId ? line.id === deur.rentalEquipmentLineId : line.equipmentId === deur.equipmentId,
  );
  const equipment = input.equipment?.find((item) => item.id === deur.equipmentId);
  const statement = input.statements?.find((item) =>
    item.id === deur.billingStatementId || item.lines.some((line) => line.deurId === deur.id),
  );
  const lineLabel = lineIndex >= 0 ? `Rental Line ${lineIndex + 1}` : "Rental equipment line";
  const equipmentLabel = equipment ? `${equipment.equipmentName} (${equipment.assetNo})` : "Equipment record unavailable";
  const deurReference = deur.deurNumber?.trim()
    ? `${deur.deurNumber} R${deur.revision?.revisionNumber ?? 1}`
    : "DEUR number unavailable";
  const statementReference = statement?.statementNo?.trim() || "a Billing Statement";

  return {
    code: "ALREADY_BILLED",
    label: `${lineLabel} — ${equipmentLabel}`,
    message: `${deurReference} was included in Billing Statement ${statementReference}.`,
  };
}
