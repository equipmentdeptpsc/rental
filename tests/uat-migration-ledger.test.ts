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

function invokeRemoteParser(table: string) {
  const encoded = Buffer.from(table, "utf8").toString("base64");
  const command = `. '${helper}'; $table = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); Get-RemoteMigrationLedger $table | Out-Null`;
  return () => execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { stdio: "pipe" });
}

function invokeTableLedger(table: string, dry: string[], expected: string[]) {
  const encoded = Buffer.from(table, "utf8").toString("base64");
  const command = `. '${helper}'; $local = ConvertTo-MigrationLedger ('${JSON.stringify(local).replace(/'/g, "''")}' | ConvertFrom-Json) 'local'; $table = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $remote = Get-RemoteMigrationLedger $table; Assert-UatMigrationLedger $local $remote @(${dry.map(value => `'${value}'`).join(",")}) @(${expected.map(value => `'${value}'`).join(",")}) | Out-Null`;
  return () => execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { stdio: "pipe" });
}

function invokeDryRunParser(dryRun: string, expected = "20260911000300,20260911000400") {
  const encoded = Buffer.from(dryRun, "utf8").toString("base64");
  const command = `. '${helper}'; $dry = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $versions = @(Get-DryRunPendingMigrationVersions $dry); if (($versions -join ',') -ne '${expected}') { throw ($versions -join ',') }`;
  return () => execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { stdio: "pipe" });
}

const table = `Initialising login role...\nConnecting to remote database...\n\n   Local            | Remote           | Time (UTC)\n  ------------------|------------------|-----------------------\n   \`20260911000100\` | \`20260911000100\` | 2026-09-11 00:01:00\n   \`20260911000200\` | \`20260911000200\` | 2026-09-11 00:02:00\n   \`20260911000300\` | \`              \` | 2026-09-11 00:03:00\n   \`20260911000400\` | \`              \` | 2026-09-11 00:04:00\n`;

describe("UAT migration ledger guard", () => {
  it("parses JSON migration ledgers", () => expect(invokeRemoteParser(JSON.stringify([{ version: "20260911000100", name: "one" }]))).not.toThrow());
  it("parses aligned and local-only CLI table rows with informational lines", () => expect(invokeRemoteParser(table)).not.toThrow());
  it("parses the current two-migration D4 table suffix in order", () => expect(invokeRemoteParser(table)).not.toThrow());
  it("rejects malformed table migration rows", () => expect(invokeRemoteParser(`${table}   \`bad\` | \`bad\` | now\n`)).toThrow());
  it("rejects a remote-only table row", () => expect(invokeTableLedger(`${table}   \`              \` | \`20260911000500\` | now\n`, ["20260911000300", "20260911000400"], ["20260911000300", "20260911000400"])).toThrow());
  it("rejects duplicate remote versions", () => expect(invokeRemoteParser(`${table}   \`20260911000200\` | \`20260911000200\` | now\n`)).toThrow());
  it("prefers the dry-run JSON summary over repeated human-readable lines", () => expect(invokeDryRunParser("Would push these migrations:\n • 20260911000300_a.sql\n • 20260911000400_b.sql\n{\"upToDate\":false,\"migrations\":[\"20260911000300_a.sql\",\"20260911000400_b.sql\"]}")).not.toThrow());
  it("accepts explicit JSON up-to-date with zero migrations", () => expect(invokeDryRunParser('{"upToDate":true,"migrations":[]}', "")).not.toThrow());
  it("accepts the canonical human-readable up-to-date message", () => expect(invokeDryRunParser("Remote database is up to date.", "")).not.toThrow());
  it("rejects empty or malformed dry-run output", () => expect(invokeDryRunParser("", "")).toThrow());

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
    ["pending ledger with zero dry-run", local.slice(0, 3), [], ["20260911000400"]],
    ["aligned ledger with pending dry-run", local, ["20260911000400"], []],
  ])("rejects %s", (_label, remote, dry, expected) => expect(invoke(remote, dry, expected)).toThrow());
});
