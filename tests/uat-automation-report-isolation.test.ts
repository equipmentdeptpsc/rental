import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const common = readFileSync("scripts/automation/common.ps1", "utf8");
const preflight = readFileSync("scripts/automation/uat-preflight.ps1", "utf8");
const deploy = readFileSync("scripts/automation/uat-deploy.ps1", "utf8");
const manifest = readFileSync("scripts/verify-uat-recovery.mjs", "utf8");

describe("UAT automation report isolation", () => {
  it("retains branch, project, migration and release guards", () => {
    expect(common).toContain("function Assert-UatTarget");
    expect(common).toContain("$script:ExpectedUatProjectRef = 'jtkctarqbwmqdcewthkn'");
    expect(preflight).toContain("Assert-UatMigrationLedger");
    expect(deploy).toContain("verify-uat-recovery.mjs");
    expect(manifest).toContain("runReport.test(path)");
    expect(manifest).toContain("git-status|last-deployed-commit");
  });

  it.skipIf(process.platform !== "win32")("creates a fresh report directory for each invocation", () => {
    const run = () => spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", ". ./scripts/automation/common.ps1; Write-Output $script:ReportRoot"], { encoding: "utf8" });
    const first = run();
    const second = run();
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    const firstPath = first.stdout.trim();
    const secondPath = second.stdout.trim();
    expect(firstPath).toMatch(/\.artifacts[\\/]automation[\\/]runs[\\/].+[\\/]reports$/);
    expect(secondPath).not.toBe(firstPath);
  });
});
