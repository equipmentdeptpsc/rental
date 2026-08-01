import {
  compareOfflineCommands,
  type OfflineCommandScope,
  type OfflineOperationalCommand,
  type OfflineOperationalCommandExecutor,
  type OfflineOperationalCommandQueue,
  type ReplayCoordinator,
  type ReplayIdentity,
} from "./offlineQueue";
import type { ReplayIdentityValidator } from "./deurOfflineCommandGateway";

export interface ReplayReport { succeeded: number; retryable: number; terminal: number; blocked: number }

export class OfflineCommandReplayEngine {
  constructor(
    private readonly queue: OfflineOperationalCommandQueue,
    private readonly executor: OfflineOperationalCommandExecutor,
    private readonly coordinator: ReplayCoordinator,
    private readonly ownerId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async replay(scope: OfflineCommandScope, identity: ReplayIdentity): Promise<ReplayReport | undefined> {
    return this.replayWithValidator(scope, { refreshAndValidate: async () => identity });
  }

  async replayWithValidator(scope: OfflineCommandScope, validator: ReplayIdentityValidator): Promise<ReplayReport | undefined> {
    return this.coordinator.runExclusive(`${scope.tenantId}.${scope.operatorId}`, async () => {
      const report: ReplayReport = { succeeded: 0, retryable: 0, terminal: 0, blocked: 0 };
      const now = this.clock();
      await this.queue.releaseExpiredClaims(now.toISOString(), scope);
      const commands = [...await this.queue.listPending(scope)].sort(compareOfflineCommands);
      const lines = new Map<string, OfflineOperationalCommand[]>();
      commands.forEach((command) => lines.set(command.rentalLineId, [...(lines.get(command.rentalLineId) ?? []), command]));
      await Promise.all([...lines.values()].map(async (line) => {
        for (const command of line) {
          if (command.nextAttemptAt && command.nextAttemptAt > now.toISOString()) continue;
          const identity = await validator.refreshAndValidate({ queued: command });
          if (!identity.authenticated || identity.tenantId !== command.tenantId || identity.userId !== command.userId ||
              identity.operatorId !== command.operatorId || !identity.assignmentValid) {
            report.blocked += 1; continue;
          }
          const expiresAt = new Date(now.getTime() + 30_000).toISOString();
          const claimed = await this.queue.claimForReplay(command.id, this.ownerId, expiresAt, now.toISOString());
          if (!claimed) continue;
          const result = await this.executor.execute(claimed);
          if (result.success) {
            await this.queue.markSucceeded(claimed.id, this.ownerId); report.succeeded += 1;
          } else if (result.retryable) {
            const delay = Math.min(60_000, 1_000 * (2 ** Math.min(claimed.attemptCount, 6)));
            await this.queue.markRetryableFailure(claimed.id, this.ownerId, result.classification ?? "UNKNOWN", new Date(now.getTime() + delay).toISOString(), now.toISOString());
            report.retryable += 1;
          } else {
            await this.queue.markTerminalFailure(claimed.id, this.ownerId, result.classification ?? "VALIDATION", now.toISOString());
            report.terminal += 1;
          }
        }
      }));
      return report;
    });
  }
}
