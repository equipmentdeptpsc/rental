import { describe, it } from "vitest";
import { createSupabasePhaseC2Harness, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";

const configuration = readSupabasePhaseC2TestConfiguration();
describe.skipIf(!configuration.enabled)("Phase C2 isolated Supabase integration", () => {
  it("connects only after the explicit safety guard accepts the target", async () => {
    const harness = createSupabasePhaseC2Harness(configuration);
    const { error } = await harness.admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
  });
});
