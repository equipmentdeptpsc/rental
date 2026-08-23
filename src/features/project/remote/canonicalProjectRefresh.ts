const listeners = new Set<() => void>();

export function requestCanonicalProjectRefresh() { for (const listener of listeners) listener(); }
export function subscribeCanonicalProjectRefresh(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
