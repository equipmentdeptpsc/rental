// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assertSafePostgresTestReset } from "./server/postgres/postgresTestSafety";

describe("PostgreSQL DEUR test reset safety", () => {
  it("requires both an explicit reset opt-in and a clearly test-named database", () => {
    expect(() => assertSafePostgresTestReset("postgres://user:secret@localhost/deur_sync_test", false)).toThrow("explicit reset opt-in");
    expect(() => assertSafePostgresTestReset("postgres://user:secret@localhost/equipment_rental", true)).toThrow("dedicated test database");
    expect(() => assertSafePostgresTestReset("postgres://user:secret@localhost/postgres", true)).toThrow("dedicated test database");
    expect(() => assertSafePostgresTestReset("not-a-url", true)).toThrow("valid PostgreSQL test URL");
  });

  it("accepts a dedicated test database without exposing credentials", () => {
    expect(() => assertSafePostgresTestReset("postgres://user:secret@localhost/deur_sync_test", true)).not.toThrow();
    try {
      assertSafePostgresTestReset("postgres://user:top-secret@localhost/production", true);
    } catch (error) {
      expect((error as Error).message).not.toContain("top-secret");
    }
  });
});
