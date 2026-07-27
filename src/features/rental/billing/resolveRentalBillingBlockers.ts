import type { EquipmentRecord } from "@/features/equipment/types";
import type { DeurRecord } from "../deur/types";
import { deriveDeurEventState } from "../deur/services/deriveDeurEventState";
import { resolveRentalLinePresentation } from "../deur/presentation/resolveDeurPresentation";
import type { RentalEquipmentLine } from "../equipment-line";

export interface RentalBillingBlocker {
  rentalEquipmentLineId: string;
  label: string;
  message: string;
  nextAction: string;
}

export function resolveRentalBillingBlockers(input: {
  lines: RentalEquipmentLine[];
  deurs: DeurRecord[];
  equipment: EquipmentRecord[];
  pendingReviewDeurIds?: Set<string>;
}): RentalBillingBlocker[] {
  return input.lines.flatMap((line) => {
    const label = resolveRentalLinePresentation(line, input.lines, input.equipment).label;
    const records = input.deurs.filter((deur) => deur.rentalEquipmentLineId === line.id && !deur.revision?.supersededByRevisionId);
    const deur = records.toSorted((a, b) => (a.revision?.revisionNumber ?? 1) - (b.revision?.revisionNumber ?? 1)).at(-1);
    const blocker = (message: string, nextAction: string): RentalBillingBlocker[] => [{ rentalEquipmentLineId: line.id, label, message, nextAction }];
    if (!line.commercialSnapshot) return blocker("Commercial Snapshot is unavailable.", "Configure Commercial Terms");
    if (!deur) return blocker("No DEUR evidence has been recorded.", "Create DEUR");
    const identity = `${deur.deurNumber ?? "DEUR"} R${deur.revision?.revisionNumber ?? 1}`;
    if (deur.status === "Draft" || deur.status === "In Progress") {
      const state = deriveDeurEventState(deur);
      if (state.hasOpenInterval || state.openPrimaryActivity) return blocker(`${identity} has an activity still open.`, "End current activity");
      return blocker(`${identity} is not submitted.`, "Submit DEUR");
    }
    if (deur.status === "Submitted" || deur.status === "Pending Acknowledgement") {
      return blocker(
        `${identity} is awaiting Customer acknowledgement.`,
        input.pendingReviewDeurIds?.has(deur.id) ? "Open Customer review request" : "Send acknowledgement request",
      );
    }
    if (deur.status === "Rejected") return blocker(`${identity} requires correction.`, "Correct DEUR");
    if (deur.status !== "Acknowledged" && deur.status !== "Billed") return blocker(`${identity} is not billing eligible.`, "Review DEUR");
    return [];
  });
}
