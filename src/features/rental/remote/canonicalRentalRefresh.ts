const eventName = "psc:canonical-rental-refresh";
export function requestCanonicalRentalRefresh() { if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName)); }
export function subscribeCanonicalRentalRefresh(listener: () => void) { if (typeof window === "undefined") return () => undefined; window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener); }
