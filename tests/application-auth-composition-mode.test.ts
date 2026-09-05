import { describe, expect, it } from "vitest";

import {
  PersistenceMode,
  createApplicationDependencies,
} from "@/app/composition";

describe("application authentication composition", () => {
  it("uses the canonical remote authentication provider only for a valid remote configuration", () => {
    const dependencies = createApplicationDependencies({
      persistenceMode: PersistenceMode.Remote,
      equipmentStatusSource: "supabase",
      supabaseUrl: "https://jtkctarqbwmqdcewthkn.supabase.co",
      supabasePublishableKey: "browser-safe-test-key",
    });

    expect(dependencies.configuration.persistenceMode).toBe(PersistenceMode.Remote);
    expect(dependencies.authentication.remoteAuthenticationProvider?.id).toBe("supabase");
  });

  it("keeps local compatibility authentication isolated to an explicitly local configuration", () => {
    const dependencies = createApplicationDependencies({
      persistenceMode: PersistenceMode.Local,
      equipmentStatusSource: "local",
    });

    expect(dependencies.configuration.persistenceMode).toBe(PersistenceMode.Local);
    expect(dependencies.authentication.remoteAuthenticationProvider).toBeUndefined();
  });
});
