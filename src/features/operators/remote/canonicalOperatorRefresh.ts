const listeners = new Set<() => void>();

export function requestCanonicalOperatorRefresh() { for (const listener of listeners) listener(); }
export function subscribeCanonicalOperatorRefresh(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
