import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";

const EVENT_NAME = "rental-workspace-change";

export function notifyRentalWorkspaceChange(rentalId: string): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { rentalId } }));
}

export function subscribeRentalWorkspaceChange(
  rentalId: string,
  refresh: () => void
): () => void {
  const listener = (event: Event) => {
    if ((event as CustomEvent<{ rentalId: string }>).detail?.rentalId === rentalId) refresh();
  };
  window.addEventListener(EVENT_NAME, listener);
  const unsubscribeDeur = subscribeDeurChanges((record) => {
    if (record.rentalId === rentalId) refresh();
  });
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    unsubscribeDeur();
  };
}
