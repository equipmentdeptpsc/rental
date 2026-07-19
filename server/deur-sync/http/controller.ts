import { DEUR_SYNC_PROTOCOL_VERSION } from "../../../src/features/rental/deur/synchronization/http/types";
import { isDeurSyncEnvelope } from "../../../src/features/rental/deur/synchronization/http/validation";
import { DeurSyncServerValidationError } from "../application/DeurSyncServerService";
import type { DeurSyncServerApplication } from "../application/types";

export interface ControllerResponse { status: number; body: unknown }
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export async function handleDeurSyncRequest(service: DeurSyncServerApplication, method: string, path: string, value: unknown): Promise<ControllerResponse> {
  if (path !== "/deur-sync/push" && path !== "/deur-sync/pull") return { status: 404, body: { message: "Endpoint not found." } };
  if (method !== "POST") return { status: 405, body: { message: "Method not allowed." } };
  if (!object(value) || value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION || typeof value.clientId !== "string" || !value.clientId.trim()) {
    return { status: 400, body: { message: "Invalid or unsupported synchronization request." } };
  }
  try {
    if (path === "/deur-sync/push") {
      if (!Array.isArray(value.changes) || !value.changes.every(isDeurSyncEnvelope) || (value.cursor !== undefined && typeof value.cursor !== "string")) return { status: 400, body: { message: "Malformed DEUR push request." } };
      const result = await service.push({ clientId: value.clientId, changes: structuredClone(value.changes), cursor: value.cursor as string | undefined });
      return { status: result.conflicts.length > 0 && result.accepted.length === 0 ? 409 : 200, body: { protocolVersion: 1, ...result } };
    }
    if ((value.cursor !== undefined && typeof value.cursor !== "string") || (value.limit !== undefined && typeof value.limit !== "number")) return { status: 400, body: { message: "Malformed DEUR pull request." } };
    const result = await service.pull({ clientId: value.clientId, cursor: value.cursor as string | undefined, limit: value.limit as number | undefined });
    return { status: 200, body: { protocolVersion: 1, ...result } };
  } catch (error) {
    if (error instanceof DeurSyncServerValidationError) return { status: 400, body: { message: error.message } };
    throw error;
  }
}
