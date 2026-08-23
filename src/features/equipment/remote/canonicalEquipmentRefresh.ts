const listeners = new Set<() => void>();
export function requestCanonicalEquipmentRefresh() { for (const listener of listeners) listener(); }
export function subscribeCanonicalEquipmentRefresh(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
