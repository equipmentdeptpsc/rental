import type { DailyLogRecord } from "./types";

const STORAGE_KEY =
  "equipment-daily-logs";

function load() {
  return JSON.parse(
    localStorage.getItem(STORAGE_KEY) ??
      "[]"
  ) as DailyLogRecord[];
}

function save(
  records: DailyLogRecord[]
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(records)
  );
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