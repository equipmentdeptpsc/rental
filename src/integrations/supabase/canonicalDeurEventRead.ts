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
  const rawEvents = record.events ?? [];
  const byId = new Map(rawEvents.map((event) => [event.id, event]));
  const canonicalIds = new Set(rows.map((row) => row.event_id));
  const events = rows.map((row) => {
    const event = byId.get(row.event_id);
    if (!event || !Number.isInteger(row.logical_sequence) || !Number.isInteger(row.physical_sequence)) return undefined;
    return { ...event, sequence: row.logical_sequence, physicalSequence: row.physical_sequence };
  });
  // Superseded originals may still be present in the browser's raw nested
  // relation when its link projection is unavailable. The database projection
  // is authoritative about their exclusion, so validate its IDs against raw
  // evidence instead of requiring identical raw and effective row counts.
  if (
    (rawEvents.length > 0 && rows.length === 0)
    || rows.length > rawEvents.length
    || canonicalIds.size !== rows.length
    || events.some((event) => !event)
  ) {
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
