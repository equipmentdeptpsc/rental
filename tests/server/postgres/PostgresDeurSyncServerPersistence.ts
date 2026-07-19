import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";
import type {
  AtomicAcceptanceResult,
  DeurSyncServerPersistence,
  ServerAcceptedOperation,
  ServerEntityState,
  StoredServerConflict,
} from "../persistence/DeurSyncServerPersistence";

function clone<T>(value: T): T { return structuredClone(value); }
function number(value: unknown): number { return Number(value); }
function isPgError(value: unknown): value is { code: string } { return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string"; }

interface AcceptedRow extends QueryResultRow { accepted_evidence: ServerAcceptedOperation }
interface EntityRow extends QueryResultRow { remote_revision: string | number; latest_envelope: DeurSyncChangeEnvelope }
interface ChangeRow extends QueryResultRow { sequence: string | number; envelope: DeurSyncChangeEnvelope }
interface TotalRow extends QueryResultRow { total: string | number }
interface ConflictRow extends QueryResultRow { conflict_evidence: StoredServerConflict }

export class PostgresDeurSyncServerPersistence implements DeurSyncServerPersistence {
  private failAcceptance = false;

  constructor(private readonly pool: Pool, private readonly options: { allowDestructiveReset?: boolean } = {}) {}

  async findByOperationId(operationId: string) { return this.findAccepted("operation_id", operationId); }
  async findByIdempotencyKey(idempotencyKey: string) { return this.findAccepted("idempotency_key", idempotencyKey); }

  async getEntityState(entityId: string): Promise<ServerEntityState | undefined> {
    const result = await this.pool.query<EntityRow>(
      "SELECT remote_revision, latest_envelope FROM deur_sync_entity_state WHERE entity_id = $1",
      [entityId],
    );
    const row = result.rows[0];
    return row ? { revision: number(row.remote_revision), latest: clone(row.latest_envelope) } : undefined;
  }

  async accept(input: { change: DeurSyncChangeEnvelope; expectedRevision: number }): Promise<AtomicAcceptanceResult> {
    const change = clone(input.change);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const lock of [`entity:${change.entity.id}`, `idempotency:${change.idempotencyKey}`, `operation:${change.operationId}`].sort()) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lock]);
      }
      const replay = await this.findAcceptedWithClient(client, change.operationId, change.idempotencyKey);
      if (replay) {
        await client.query("COMMIT");
        return { kind: "replayed", accepted: replay };
      }
      const entityResult = await client.query<EntityRow>(
        "SELECT remote_revision, latest_envelope FROM deur_sync_entity_state WHERE entity_id = $1 FOR UPDATE",
        [change.entity.id],
      );
      const entityRow = entityResult.rows[0];
      const currentRevision = entityRow ? number(entityRow.remote_revision) : 0;
      const current = entityRow ? { revision: currentRevision, latest: clone(entityRow.latest_envelope) } : undefined;
      if (currentRevision !== input.expectedRevision) {
        await client.query("ROLLBACK");
        return { kind: "revision-mismatch", currentRevision, current };
      }

      const remoteRevision = currentRevision + 1;
      const stored: DeurSyncChangeEnvelope = { ...change, remoteRevision };
      const accepted: ServerAcceptedOperation = {
        operationId: change.operationId,
        idempotencyKey: change.idempotencyKey,
        remoteRevision,
        change: clone(stored),
      };
      await client.query(
        `INSERT INTO deur_sync_accepted_operations
          (operation_id, idempotency_key, entity_id, operation_type, remote_revision, schema_version, accepted_evidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [change.operationId, change.idempotencyKey, change.entity.id, change.operation, remoteRevision, change.schemaVersion, JSON.stringify(accepted)],
      );
      await client.query(
        `INSERT INTO deur_sync_entity_state (entity_id, remote_revision, latest_envelope)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (entity_id) DO UPDATE SET
           remote_revision = EXCLUDED.remote_revision,
           latest_envelope = EXCLUDED.latest_envelope,
           updated_timestamp = clock_timestamp()`,
        [change.entity.id, remoteRevision, JSON.stringify(stored)],
      );
      await client.query(
        `INSERT INTO deur_sync_change_log (entity_id, operation_id, remote_revision, envelope)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [change.entity.id, change.operationId, remoteRevision, JSON.stringify(stored)],
      );
      if (this.failAcceptance) {
        this.failAcceptance = false;
        throw new Error("Simulated PostgreSQL acceptance failure.");
      }
      await client.query("COMMIT");
      return { kind: "accepted", accepted: clone(accepted) };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPgError(error) && error.code === "23505") {
        const replay = await this.findByOperationId(change.operationId) ?? await this.findByIdempotencyKey(change.idempotencyKey);
        if (replay) return { kind: "replayed", accepted: replay };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async readChanges(cursor: number, limit: number) {
    const [changesResult, totalResult] = await Promise.all([
      this.pool.query<ChangeRow>(
        "SELECT sequence, envelope FROM deur_sync_change_log WHERE sequence > $1 ORDER BY sequence ASC LIMIT $2",
        [cursor, limit],
      ),
      this.pool.query<TotalRow>("SELECT COALESCE(MAX(sequence), 0) AS total FROM deur_sync_change_log"),
    ]);
    const rows = changesResult.rows;
    return {
      changes: rows.map((row) => clone(row.envelope)),
      total: number(totalResult.rows[0]?.total ?? 0),
      nextCursor: rows.length ? number(rows.at(-1)!.sequence) : cursor,
    };
  }

  async recordConflict(conflict: StoredServerConflict): Promise<StoredServerConflict> {
    const snapshot = clone(conflict);
    await this.pool.query(
      `INSERT INTO deur_sync_conflicts
        (conflict_id, entity_id, classification, local_envelope, remote_envelope, conflict_evidence)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       ON CONFLICT (conflict_id) DO NOTHING`,
      [snapshot.id, snapshot.local.entity.id, snapshot.reason, JSON.stringify(snapshot.local), JSON.stringify(snapshot.remote), JSON.stringify(snapshot)],
    );
    return (await this.findConflict(snapshot.id)) ?? snapshot;
  }

  async findConflict(id: string): Promise<StoredServerConflict | undefined> {
    const result = await this.pool.query<ConflictRow>(
      "SELECT conflict_evidence FROM deur_sync_conflicts WHERE conflict_id = $1",
      [id],
    );
    return result.rows[0] ? clone(result.rows[0].conflict_evidence) : undefined;
  }

  async reset(): Promise<void> {
    if (!this.options.allowDestructiveReset) {
      throw new Error("PostgreSQL test reset is disabled without explicit adapter opt-in.");
    }
    await this.pool.query(
      "TRUNCATE TABLE deur_sync_conflicts, deur_sync_change_log, deur_sync_accepted_operations, deur_sync_entity_state RESTART IDENTITY CASCADE",
    );
    this.failAcceptance = false;
  }

  failNextAcceptance(): void { this.failAcceptance = true; }

  private async findAccepted(column: "operation_id" | "idempotency_key", value: string): Promise<ServerAcceptedOperation | undefined> {
    const result = await this.pool.query<AcceptedRow>(
      `SELECT accepted_evidence FROM deur_sync_accepted_operations WHERE ${column} = $1`,
      [value],
    );
    return result.rows[0] ? clone(result.rows[0].accepted_evidence) : undefined;
  }

  private async findAcceptedWithClient(client: PoolClient, operationId: string, idempotencyKey: string): Promise<ServerAcceptedOperation | undefined> {
    const result = await client.query<AcceptedRow>(
      "SELECT accepted_evidence FROM deur_sync_accepted_operations WHERE operation_id = $1 OR idempotency_key = $2 LIMIT 1",
      [operationId, idempotencyKey],
    );
    return result.rows[0] ? clone(result.rows[0].accepted_evidence) : undefined;
  }
}
