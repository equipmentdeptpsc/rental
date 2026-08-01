import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OperationalEvent,
  OperationalEventCursor,
  OperationalEventFilter,
  OperationalEventPage,
  OperationalEventRepository,
  OperationalEventType,
} from "@/features/rental/realtime";
import { compareOperationalEvents, cursorForOperationalEvent, isAfterOperationalCursor } from "@/features/rental/realtime";

interface DeurEventRow {
  id: string;
  activity_type: string;
  action: string;
  occurred_at: string;
  sequence: number;
  company_id: string;
  deurs: {
    rental_id: string;
    rental_equipment_line_id: string;
    equipment_id: string;
    operator_id: string;
    row_version: number;
  } | Array<{
    rental_id: string;
    rental_equipment_line_id: string;
    equipment_id: string;
    operator_id: string;
    row_version: number;
  }>;
}

function canonicalType(row: DeurEventRow): OperationalEventType | undefined {
  const key = `${row.activity_type}:${row.action}`;
  const mapping: Record<string, OperationalEventType> = {
    "shift:end": "OperationStopped",
    "operation:start": row.sequence <= 2 ? "OperationStarted" : "OperationResumed",
    "operation:end": "OperationPaused",
    "idle:start": "IdleStarted",
    "idle:end": "IdleEnded",
    "standby:start": "StandbyStarted",
    "standby:end": "StandbyEnded",
    "mealBreak:start": "MealBreakStarted",
    "mealBreak:end": "MealBreakEnded",
    "breakdown:start": "BreakdownStarted",
    "breakdown:end": "BreakdownEnded",
  };
  return mapping[key];
}

export class SupabaseOperationalEventRepository implements OperationalEventRepository {
  constructor(private readonly client: SupabaseClient) {}

  async append(_event: OperationalEvent): Promise<"APPENDED" | "DUPLICATE"> {
    throw new Error("REMOTE_OPERATIONAL_EVENT_PUBLISH_DISABLED: publish through authorized business commands.");
  }

  async listAfter(
    filter: OperationalEventFilter,
    cursor?: OperationalEventCursor,
    limit = 100,
  ): Promise<OperationalEventPage> {
    let query = this.client.schema("erp").from("deur_events").select(`
      id,activity_type,action,occurred_at,sequence,company_id,
      deurs!inner(rental_id,rental_equipment_line_id,equipment_id,operator_id,row_version)
    `).order("occurred_at", { ascending: true })
      .order("sequence", { ascending: true })
      .order("id", { ascending: true })
      .limit(Math.max(1, limit * 2));
    if (cursor) query = query.gte("occurred_at", cursor.occurredAt);
    if (filter.rentalId) query = query.eq("deurs.rental_id", filter.rentalId);
    if (filter.rentalLineId) {
      query = query.eq("deurs.rental_equipment_line_id", filter.rentalLineId);
    }
    const result = await query;
    if (result.error) throw new Error(`REMOTE_OPERATIONAL_EVENT_READ_FAILED:${result.error.code}`);
    const events = ((result.data ?? []) as unknown as DeurEventRow[])
      .flatMap((row): OperationalEvent[] => {
        const deur = Array.isArray(row.deurs) ? row.deurs[0] : row.deurs;
        const type = canonicalType(row);
        if (!deur || !type || !deur.rental_equipment_line_id) return [];
        return [{
          eventId: row.id,
          tenantId: filter.tenantId,
          rentalId: deur.rental_id,
          rentalLineId: deur.rental_equipment_line_id,
          equipmentId: deur.equipment_id,
          operatorId: deur.operator_id,
          type,
          occurredAt: row.occurred_at,
          sequence: row.sequence,
          aggregateVersion: Number(deur.row_version ?? 0),
          payload: {},
        }];
      })
      .filter((event) => isAfterOperationalCursor(event, cursor))
      .sort(compareOperationalEvents)
      .slice(0, Math.max(1, limit));
    return {
      events,
      ...(events.length ? { nextCursor: cursorForOperationalEvent(events.at(-1)!) } : {}),
    };
  }
}
