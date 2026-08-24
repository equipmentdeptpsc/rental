const listeners = new Set<() => void>();
export function requestCanonicalCustomerRefresh() { for (const listener of listeners) listener(); }
export function subscribeCanonicalCustomerRefresh(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
