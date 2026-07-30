import type { DeurRecord } from "../types";
import type { DeurCommandResult, RemoteDeurRepository } from "./contracts";

export class LocalVersionedDeurRepository implements RemoteDeurRepository {
  private readonly records = new Map<string, { record: DeurRecord; version: number }>();

  constructor(seed: Array<{ record: DeurRecord; version: number }> = []) {
    seed.forEach((item) => this.records.set(item.record.id, structuredClone(item)));
  }

  async getById(id: string) {
    const current = this.records.get(id);
    return current ? structuredClone(current) : undefined;
  }

  async save(record: DeurRecord, concurrency: { expectedVersion: number }): Promise<DeurCommandResult> {
    const current = this.records.get(record.id);
    const currentVersion = current?.version ?? 0;
    if (concurrency.expectedVersion !== currentVersion) {
      return { success: false, code: "CONFLICT", message: "The DEUR changed before this command was saved.", expectedVersion: concurrency.expectedVersion, currentVersion };
    }
    const version = currentVersion + 1;
    const persisted = structuredClone(record);
    this.records.set(record.id, { record: persisted, version });
    return { success: true, record: structuredClone(persisted), version };
  }
}
