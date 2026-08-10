export type CanonicalUserChangeListener = (userId: string) => void;

const listeners = new Set<CanonicalUserChangeListener>();

export function notifyCanonicalUserChanged(userId: string): void {
  listeners.forEach((listener) => listener(userId));
}

export function subscribeCanonicalUserChanges(listener: CanonicalUserChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
