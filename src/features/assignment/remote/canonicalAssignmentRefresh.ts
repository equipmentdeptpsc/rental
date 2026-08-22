const listeners = new Set<() => void>();

export function requestCanonicalAssignmentRefresh() { for (const listener of listeners) listener(); }
export function subscribeCanonicalAssignmentRefresh(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
