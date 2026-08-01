import type { ReplayCoordinator } from "./offlineQueue";

interface LockManagerLike {
  request<T>(name: string, options: { ifAvailable: true }, callback: (lock: unknown | null) => Promise<T | undefined>): Promise<T | undefined>;
}

export class BrowserReplayCoordinator implements ReplayCoordinator {
  private static readonly fallbackLeases = new Set<string>();
  constructor(private readonly locks?: LockManagerLike) {}

  async runExclusive<T>(scopeKey: string, action: () => Promise<T>): Promise<T | undefined> {
    const name = `equipment-rental.offline-replay.${scopeKey}`;
    if (this.locks) return this.locks.request(name, { ifAvailable: true }, (lock) => lock ? action() : Promise.resolve(undefined));
    if (BrowserReplayCoordinator.fallbackLeases.has(name)) return undefined;
    BrowserReplayCoordinator.fallbackLeases.add(name);
    try { return await action(); } finally { BrowserReplayCoordinator.fallbackLeases.delete(name); }
  }
}
