import type { DailyLogRecord } from "./types";
import { storage } from "@/core/storage";

const STORAGE_KEY =
  "equipment-daily-logs";

function load() {
  try {
    const records = storage.get<unknown>(STORAGE_KEY);
    return Array.isArray(records) ? records as DailyLogRecord[] : [];
  } catch {
    return [];
  }
}

function save(
  records: DailyLogRecord[]
) {
  storage.set(STORAGE_KEY, records);
}

export const dailyLogRepository = {
  getAll() {
    return load();
  },

  create(
    item: DailyLogRecord
  ) {
    const data = load();

    data.push(item);

    save(data);
  },

  update(
    item: DailyLogRecord
  ) {
    save(
      load().map((x) =>
        x.id === item.id ? item : x
      )
    );
  },

  delete(id: string) {
    save(
      load().filter(
        (x) => x.id !== id
      )
    );
  },
};
