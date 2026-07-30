import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";

const EVENT_NAME = "rental-workspace-change";
export interface RentalWorkspaceChange {
  rentalId: string;
  rentalLineId?: string;
  deurId?: string;
  equipmentId?: string;
  operatorId?: string;
}

export function notifyRentalWorkspaceChange(rentalId: string, target: Omit<RentalWorkspaceChange, "rentalId"> = {}): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { rentalId, ...target } }));
}

export function subscribeRentalWorkspaceChange(
  rentalId: string,
  refresh: (change?: RentalWorkspaceChange) => void,
  rentalLineId?: string,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<RentalWorkspaceChange>).detail;
    if (detail?.rentalId === rentalId && (!rentalLineId || !detail.rentalLineId || detail.rentalLineId === rentalLineId)) refresh(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  const unsubscribeDeur = subscribeDeurChanges((record) => {
    if (record.rentalId === rentalId && (!rentalLineId || record.rentalEquipmentLineId === rentalLineId)) {
      refresh({ rentalId, rentalLineId: record.rentalEquipmentLineId, deurId: record.id, equipmentId: record.equipmentId, operatorId: record.operatorId });
    }
  });
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    unsubscribeDeur();
  };
}
