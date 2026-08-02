import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { OperationalEvent, OperationalEventFilter, OperationalRealtimeSource } from "@/features/rental/realtime";

interface DeurEventRow {
  id: string; company_id: string; deur_id: string; activity_type: string; action: string;
  occurred_at: string; sequence: number;
}
interface DeurProjectionRow {
  rental_id: string; rental_equipment_line_id: string; equipment_id: string; operator_id: string; row_version: number;
}

function canonicalType(row: DeurEventRow): OperationalEvent["type"] | undefined {
  const mapping: Record<string, OperationalEvent["type"]> = {
    "shift:end": "OperationStopped", "operation:start": row.sequence <= 2 ? "OperationStarted" : "OperationResumed",
    "operation:end": "OperationPaused", "idle:start": "IdleStarted", "idle:end": "IdleEnded",
    "standby:start": "StandbyStarted", "standby:end": "StandbyEnded", "mealBreak:start": "MealBreakStarted",
    "mealBreak:end": "MealBreakEnded", "breakdown:start": "BreakdownStarted", "breakdown:end": "BreakdownEnded",
  };
  return mapping[`${row.activity_type}:${row.action}`];
}

export class SupabaseOperationalRealtimeSource implements OperationalRealtimeSource {
  constructor(private readonly client: SupabaseClient) {}

  subscribe(
    filter: OperationalEventFilter,
    handlers: Parameters<OperationalRealtimeSource["subscribe"]>[1],
  ): () => void {
    let channel: RealtimeChannel;
    let active = true;
    let subscribedOnce = false;
    let replacing = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const concreteTenant = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filter.tenantId);
    const subscription = {
      event: "INSERT" as const, schema: "erp", table: "deur_events",
      ...(concreteTenant ? { filter: `company_id=eq.${filter.tenantId}` } : {}),
    };
    const onMessage = async (message: { new: Record<string, unknown> }) => {
      const row = message.new as unknown as DeurEventRow;
      if (concreteTenant && row.company_id !== filter.tenantId) return;
      const type = canonicalType(row);
      if (!type) return;
      const result = await this.client.schema("erp").from("deurs")
        .select("rental_id,rental_equipment_line_id,equipment_id,operator_id,row_version")
        .eq("id", row.deur_id).maybeSingle();
      if (result.error || !result.data) { handlers.error(result.error ?? new Error("REALTIME_DEUR_PROJECTION_NOT_FOUND")); return; }
      const deur = result.data as DeurProjectionRow;
      if ((filter.rentalId && deur.rental_id !== filter.rentalId) ||
          (filter.rentalLineId && deur.rental_equipment_line_id !== filter.rentalLineId)) return;
      handlers.event({
        eventId: row.id, tenantId: filter.tenantId, rentalId: deur.rental_id,
        rentalLineId: deur.rental_equipment_line_id, equipmentId: deur.equipment_id,
        operatorId: deur.operator_id, type, occurredAt: row.occurred_at,
        sequence: row.sequence, aggregateVersion: Number(deur.row_version ?? 0), payload: {},
      });
    };

    const waitForDisconnect = async () => {
      const deadline = Date.now() + 1_000;
      while (this.client.realtime.isDisconnecting()) {
        if (Date.now() >= deadline) throw new Error("REALTIME_DISCONNECT_TIMEOUT");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    const scheduleRecovery = () => {
      if (!active || recoveryTimer) return;
      handlers.recovery?.("AUTO_RECONNECTING");
      recoveryTimer = setTimeout(async () => {
        recoveryTimer = undefined;
        if (!active) return;
        handlers.recovery?.("RECREATING_CHANNEL");
        try {
          const refreshed = await this.client.auth.refreshSession();
          if (refreshed.error || !refreshed.data.session?.access_token) {
            throw refreshed.error ?? new Error("REALTIME_SESSION_MISSING");
          }
          await this.client.realtime.setAuth(refreshed.data.session.access_token);
          replacing = true;
          await this.client.removeChannel(channel);
          await waitForDisconnect();
          replacing = false;
          if (active) createChannel();
        } catch (error) {
          replacing = false;
          handlers.recovery?.("FAILED");
          handlers.error(error);
        }
      }, 2_000);
    };

    const createChannel = () => {
      channel = this.client.channel(`deur-events:${filter.tenantId}:${filter.rentalId ?? "*"}`)
        .on("postgres_changes", subscription, onMessage)
        .subscribe((status, error) => {
          if (!active || replacing) return;
          if (status === "SUBSCRIBED") {
            if (recoveryTimer) clearTimeout(recoveryTimer);
            recoveryTimer = undefined;
            if (subscribedOnce) handlers.recovery?.("RECOVERED");
            subscribedOnce = true;
            handlers.connected();
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            handlers.recovery?.("DEGRADED");
            if (status === "CLOSED") handlers.disconnected();
            else handlers.error(error ?? new Error(status));
            scheduleRecovery();
          }
        });
    };

    createChannel();
    return () => {
      active = false;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      replacing = true;
      void this.client.removeChannel(channel);
    };
  }
}
