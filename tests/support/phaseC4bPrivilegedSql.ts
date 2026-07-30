import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSupabaseFixtureMutationAllowed,
  type SupabasePhaseC2TestConfiguration,
} from "./supabasePhaseC2Harness";

const forbiddenSql = [
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\balter\s+(?:table|schema|role)\b/i,
  /\bdisable\s+row\s+level\s+security\b/i,
  /\bdisable\s+trigger\b/i,
  /\btruncate\b/i,
  /\bsupabase_migrations\b/i,
  /\bservice_role\b/i,
  /\btenant-local-001\b/i,
  /\bcreate\s+(?:or\s+replace\s+)?function\b/i,
  /\bsecurity\s+definer\b/i,
] as const;

export interface PhaseC4bSqlExecution {
  readonly sql: string;
  readonly tenantIds: readonly string[];
}

export function assertSafePhaseC4bFixtureSql(execution: PhaseC4bSqlExecution): void {
  if (!execution.sql.trim()) throw new Error("C4B fixture SQL must not be empty.");
  if (forbiddenSql.some((pattern) => pattern.test(execution.sql))) {
    throw new Error("C4B fixture SQL contains a forbidden privilege, security, migration, or baseline operation.");
  }
  const tenantLiterals = [...execution.sql.matchAll(/TENANT-[A-Z0-9-]+/g)].map((match) => match[0]);
  if (tenantLiterals.some((tenantId) => !execution.tenantIds.includes(tenantId))) {
    throw new Error("C4B fixture SQL references a tenant outside the explicit allowlist.");
  }
}

export function executePhaseC4bPrivilegedSql(
  configuration: SupabasePhaseC2TestConfiguration,
  execution: PhaseC4bSqlExecution,
): string {
  assertSupabaseFixtureMutationAllowed(configuration, execution.tenantIds);
  assertSafePhaseC4bFixtureSql(execution);
  const directory = mkdtempSync(join(tmpdir(), "equipment-rental-c4b-"));
  const sqlFile = join(directory, "fixture.sql");
  try {
    writeFileSync(sqlFile, execution.sql, { encoding: "utf8", mode: 0o600 });
    const executable =
      process.env.SUPABASE_CLI_PATH ??
      "C:\\Users\\JUANCHO\\scoop\\shims\\supabase.exe";
    const result = spawnSync(executable, ["db", "query", "--linked", "--file", sqlFile], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      env: process.env,
    });
    if (result.status !== 0) {
      const safeMessage = `${result.stderr ?? ""}\n${result.stdout ?? ""}`
        .replaceAll(configuration.serviceKey ?? "", "[REDACTED]")
        .replaceAll(configuration.publishableKey ?? "", "[REDACTED]")
        .replaceAll(configuration.url ?? "", "[REDACTED]")
        .trim();
      throw new Error(`Privileged C4B fixture SQL failed (${result.status ?? "unknown"}): ${safeMessage}`);
    }
    return (result.stdout ?? "").trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
