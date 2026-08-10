import type { RentalRecord } from "../types";
import type { RentalEquipmentLine } from "../equipment-line";

export interface RentalEngagement {
  readonly key: string;
  readonly customerId: string;
  readonly projectId: string;
  readonly customer: string;
  readonly project: string;
  readonly rentals: readonly RentalRecord[];
  readonly lines: readonly RentalEquipmentLine[];
  readonly activeEquipmentCount: number;
  readonly returnedFinanciallyOpenCount: number;
}

export function projectActiveRentalEngagements(input: { rentals: readonly RentalRecord[]; lines: readonly RentalEquipmentLine[] }): readonly RentalEngagement[] {
  const groups = new Map<string, { rentals: RentalRecord[]; lines: RentalEquipmentLine[] }>();
  input.rentals.filter((rental) => rental.status !== "Closed" && rental.status !== "Cancelled").forEach((rental) => {
    const customerId = rental.customerId || `legacy:${rental.customer}`;
    const projectId = rental.projectId || `legacy:${rental.project}`;
    const key = `${customerId}::${projectId}`;
    const group = groups.get(key) ?? { rentals: [], lines: [] };
    group.rentals.push(rental);
    group.lines.push(...input.lines.filter((line) => line.rentalId === rental.id));
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, group]) => {
    const first = group.rentals[0];
    return {
      key,
      customerId: first.customerId || `legacy:${first.customer}`,
      projectId: first.projectId || `legacy:${first.project}`,
      customer: first.customer,
      project: first.project,
      rentals: group.rentals,
      lines: group.lines,
      activeEquipmentCount: group.lines.filter((line) => ["Reserved", "Released", "Active"].includes(line.status)).length,
      returnedFinanciallyOpenCount: group.rentals.filter((rental) => rental.status === "Returned").length,
    };
  });
}
