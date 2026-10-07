import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/DailyLogs.tsx", "utf8");

describe("Daily Logs canonical remote UI", () => {
  it("uses the canonical DEUR read boundary in remote mode", () => {
    expect(source).toContain("PersistenceMode.Remote");
    expect(source).toContain("<RemoteDailyLogsPage />");
    const remotePage = readFileSync("src/features/daily-log/components/RemoteDailyLogsPage.tsx", "utf8");
    expect(remotePage).toContain("Loading Daily Logs");
    expect(remotePage).toContain("Search Daily Logs");
    expect(source).not.toContain("useDailyLog");
  });

  it("links records to the existing Rental DEUR workspace without adding a write workflow", () => {
    const remotePage = readFileSync("src/features/daily-log/components/RemoteDailyLogsPage.tsx", "utf8");
    expect(remotePage).toContain("/workspace");
    expect(remotePage).toContain("Open Rental");
    expect(remotePage).not.toContain("New Daily Log");
  });
});
