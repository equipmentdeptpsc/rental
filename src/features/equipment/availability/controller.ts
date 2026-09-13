import type { RepositoryResult } from "@/core/persistence";
import type { EquipmentAvailabilityInput, EquipmentAvailabilityRepository, EquipmentAvailabilityResult } from "./canonical";

export type EquipmentAvailabilityState =
  | { status: "not_checked" }
  | { status: "checking" }
  | { status: "available"; result: EquipmentAvailabilityResult }
  | { status: "conflict"; result?: EquipmentAvailabilityResult; message?: string }
  | { status: "error"; message: string };

export type AvailabilityRequest = EquipmentAvailabilityInput & { key: string };

export class EquipmentAvailabilityController {
  private readonly states = new Map<string, EquipmentAvailabilityState>();
  private readonly generations = new Map<string, number>();
  constructor(private readonly repository: EquipmentAvailabilityRepository) {}

  getState(key: string): EquipmentAvailabilityState { return this.states.get(key) ?? { status: "not_checked" }; }

  async check(request: AvailabilityRequest): Promise<EquipmentAvailabilityState> {
    const generation = (this.generations.get(request.key) ?? 0) + 1;
    this.generations.set(request.key, generation);
    if (!request.equipmentId || !request.windowStart) {
      const state = { status: "not_checked" } as const; this.states.set(request.key, state); return state;
    }
    this.states.set(request.key, { status: "checking" });
    const result = await this.repository.checkEquipmentAvailability(request);
    if (this.generations.get(request.key) !== generation) return this.getState(request.key);
    const state = result.success
      ? result.value.available ? { status: "available", result: result.value } as const : { status: "conflict", result: result.value } as const
      : { status: "error", message: result.message } as const;
    this.states.set(request.key, state); return state;
  }

  markWriteResult(key: string, result: { success: boolean; code?: string; message?: string; value?: EquipmentAvailabilityResult }): EquipmentAvailabilityState {
    if (result.success || result.code !== "EQUIPMENT_INTERVAL_CONFLICT") return this.getState(key);
    const state = { status: "conflict", ...(result.value ? { result: result.value } : {}), ...(result.message ? { message: result.message } : {}) } as EquipmentAvailabilityState;
    this.states.set(key, state); return state;
  }
}
