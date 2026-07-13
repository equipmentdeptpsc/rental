import type { RentalContractRecord } from "../types/RentalContract";

const STORAGE_KEY = "equipment-rental-contracts";

export function getRentalContract(
  rentalId: string
): RentalContractRecord | undefined {

  const raw =
    localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return undefined;
  }

  const contracts =
    JSON.parse(raw) as RentalContractRecord[];

  return contracts.find(
    c => c.id === rentalId
  );

}