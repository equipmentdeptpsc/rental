import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { DeurRecord } from "@/features/rental/deur/types";

interface CanonicalOrderRow {
  event_id: string;
  physical_sequence: number;
  logical_sequence: number;
  lineage_root_event_id: string;
}

/** Applies the database-owned logical order without changing raw event fields. */
export function applyCanonicalDeurEventOrder(record: DeurRecord, rows: readonly CanonicalOrderRow[]): RepositoryResult<DeurRecord> {
  const effectiveEvents = (record.events ?? []).filter((event) => event.superseded !== true);
  const byId = new Map(effectiveEvents.map((event) => [event.id, event]));
  const events = rows.map((row) => {
    const event = byId.get(row.event_id);
    if (!event || !Number.isInteger(row.logical_sequence) || !Number.isInteger(row.physical_sequence)) return undefined;
    return { ...event, sequence: row.logical_sequence, physicalSequence: row.physical_sequence };
  });
  if (events.length !== effectiveEvents.length || events.some((event) => !event)) {
    return repositoryFailure("REMOTE_ROW_MALFORMED", "Canonical DEUR event order did not cover the complete effective event stream.", {
      context: { repository: "DEUR", deurId: record.id }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Reconcile the canonical DEUR event projection.",
    });
  }
  return repositorySuccess({ ...record, events: events as DeurRecord["events"] });
}

/** Reads the tenant-checked wrapper around the database canonical projection. */
export async function readCanonicalDeurEventOrder(client: SupabaseClient, record: DeurRecord, signal?: AbortSignal): Promise<RepositoryResult<DeurRecord>> {
  const query = client.schema("erp").rpc("read_effective_deur_event_order", { target_deur_id: record.id });
  const { data, error } = signal ? await query.abortSignal(signal) : await query;
  if (error || !Array.isArray(data)) {
    return repositoryFailure("REMOTE_READ_FAILED", "Canonical DEUR event order could not be read.", {
      context: { repository: "DEUR", deurId: record.id }, recoverability: "RETRYABLE", recommendedAction: "Retry the request.",
    });
  }
  return applyCanonicalDeurEventOrder(record, data as CanonicalOrderRow[]);
}
