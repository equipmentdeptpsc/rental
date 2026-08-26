import type { DeurRecord } from "@/features/rental/deur/types";

export function resolveRentalWorkspaceDeurs(input: {
  rentalId: string;
  remote: boolean;
  remoteDeurs: readonly DeurRecord[];
  localDeurs: readonly DeurRecord[];
}): DeurRecord[] {
  const source = input.remote ? input.remoteDeurs : input.localDeurs;
  return source.filter((record) => record.rentalId === input.rentalId);
}
