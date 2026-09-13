import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const powershell = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell";
const helper = path.resolve("scripts/automation/uat-migration-ledger.ps1").replace(/'/g, "''");
const local = [{ version: "20260911000100", name: "one" }, { version: "20260911000200", name: "two" }, { version: "20260911000300", name: "three" }, { version: "20260911000400", name: "four" }];

function invoke(remote: unknown, dry: string[], expected: string[]) {
  const command = `. '${helper}'; $local = ConvertTo-MigrationLedger ('${JSON.stringify(local).replace(/'/g, "''")}' | ConvertFrom-Json) 'local'; $remote = ConvertTo-MigrationLedger ('${JSON.stringify(remote).replace(/'/g, "''")}' | ConvertFrom-Json) 'remote'; Assert-UatMigrationLedger $local $remote @(${dry.map(value => `'${value}'`).join(",")}) @(${expected.map(value => `'${value}'`).join(",")}) | Out-Null`;
  return () => execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { stdio: "pipe" });
}

describe("UAT migration ledger guard", () => {
  it.each([
    ["zero pending", local, [], []],
    ["one pending", local.slice(0, 3), ["20260911000400"], ["20260911000400"]],
    ["two ordered pending", local.slice(0, 2), ["20260911000300", "20260911000400"], ["20260911000300", "20260911000400"]],
  ])("accepts %s contiguous forward-only suffix", (_label, remote, dry, expected) => expect(invoke(remote, dry, expected)).not.toThrow());

  it.each([
    ["reversed dry-run order", local.slice(0, 2), ["20260911000400", "20260911000300"], ["20260911000300", "20260911000400"]],
    ["skipped earlier migration", local.slice(0, 2), ["20260911000400"], ["20260911000400"]],
    ["non-contiguous remote ledger", [local[0], local[2]], ["20260911000200", "20260911000400"], ["20260911000200", "20260911000400"]],
    ["remote ledger ahead", [...local, { version: "20260911000500", name: "future" }], [], []],
    ["applied migration name mismatch", [{ version: "20260911000100", name: "edited" }], ["20260911000200", "20260911000300", "20260911000400"], ["20260911000200", "20260911000300", "20260911000400"]],
    ["dry-run disagreement", local.slice(0, 2), ["20260911000300"], ["20260911000300", "20260911000400"]],
  ])("rejects %s", (_label, remote, dry, expected) => expect(invoke(remote, dry, expected)).toThrow());
});
