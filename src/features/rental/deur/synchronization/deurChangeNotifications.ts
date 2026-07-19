import type { DeurRecord } from "../types";

export const DEUR_STORAGE_KEY = "equipment-rental-deur";

const LOCAL_EVENT_NAME = "deur-record-change";

type DeurChangeListener = (record: DeurRecord) => void;

function cloneRecord(record: DeurRecord): DeurRecord {
  return structuredClone(record);
}

function readRecords(value: string | null): DeurRecord[] | undefined {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as DeurRecord[] : undefined;
  } catch {
    return undefined;
  }
}

function changedRecords(event: StorageEvent): DeurRecord[] {
  if (event.key !== DEUR_STORAGE_KEY) return [];

  const previous = readRecords(event.oldValue);
  const current = readRecords(event.newValue);
  if (!previous || !current) return [];

  const previousById = new Map(previous.map((record) => [record.id, JSON.stringify(record)]));
  return current.filter((record) => previousById.get(record.id) !== JSON.stringify(record));
}

/** Publishes an already-persisted DEUR mutation to subscribers in this document. */
export function notifyDeurChange(record: DeurRecord): void {
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT_NAME, { detail: cloneRecord(record) }));
}

/**
 * Observes local repository writes and localStorage writes made by another tab.
 * Browser storage events do not cross browser profiles or physical devices.
 */
export function subscribeDeurChanges(listener: DeurChangeListener): () => void {
  let lastSignature: string | undefined;

  const deliver = (record: DeurRecord) => {
    const snapshot = cloneRecord(record);
    const signature = JSON.stringify(snapshot);
    if (signature === lastSignature) return;
    lastSignature = signature;
    listener(snapshot);
  };

  const localListener = (event: Event) => {
    const record = (event as CustomEvent<DeurRecord>).detail;
    if (record) deliver(record);
  };
  const storageListener = (event: StorageEvent) => {
    changedRecords(event).forEach(deliver);
  };

  window.addEventListener(LOCAL_EVENT_NAME, localListener);
  window.addEventListener("storage", storageListener);

  return () => {
    window.removeEventListener(LOCAL_EVENT_NAME, localListener);
    window.removeEventListener("storage", storageListener);
  };
}
