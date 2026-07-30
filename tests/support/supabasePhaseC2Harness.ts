import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabasePhaseC2TestConfiguration {
  enabled: boolean;
  url?: string;
  publishableKey?: string;
  serviceKey?: string;
  environmentId?: string;
  projectRef?: string;
  allowMutation?: boolean;
}

export function readSupabasePhaseC2TestConfiguration(environment: NodeJS.ProcessEnv = process.env): SupabasePhaseC2TestConfiguration {
  return {
    enabled: environment.RUN_SUPABASE_INTEGRATION_TESTS === "true",
    url: environment.SUPABASE_TEST_URL,
    publishableKey: environment.SUPABASE_TEST_PUBLISHABLE_KEY,
    serviceKey: environment.SUPABASE_TEST_SERVICE_KEY,
    environmentId: environment.SUPABASE_TEST_ENVIRONMENT_ID,
    projectRef: environment.SUPABASE_TEST_PROJECT_REF,
    allowMutation: environment.ALLOW_SUPABASE_TEST_MUTATION === "true",
  };
}

export function assertSafeSupabaseTestConfiguration(configuration: SupabasePhaseC2TestConfiguration): asserts configuration is Required<SupabasePhaseC2TestConfiguration> {
  if (!configuration.enabled) throw new Error("Supabase integration tests are disabled.");
  if (!configuration.url || !configuration.publishableKey || !configuration.serviceKey || !configuration.environmentId || !configuration.projectRef) throw new Error("All SUPABASE_TEST_* values, environment ID, and project ref are required.");
  const url = new URL(configuration.url);
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const hostedProjectRef = url.hostname.endsWith(".supabase.co") ? url.hostname.slice(0, -".supabase.co".length) : "";
  const projectMatchesUrl = hostedProjectRef === configuration.projectRef;
  const safeIdentity = /(^|[-_])(test|testing|uat|staging|dev|development)([-_]|$)/i.test(configuration.environmentId);
  if ((!localHost && !projectMatchesUrl) || !safeIdentity) throw new Error("Refusing suspicious Supabase target; use an explicitly identified isolated test environment whose URL and project ref match.");
}

export function assertSupabaseFixtureMutationAllowed(configuration: SupabasePhaseC2TestConfiguration, tenantIds: readonly string[]): void {
  assertSafeSupabaseTestConfiguration(configuration);
  if (!configuration.allowMutation) throw new Error("Supabase test mutation is disabled.");
  if (!tenantIds.length || tenantIds.some((id) => !/^TENANT-UAT-[A-Z0-9-]+$/.test(id))) {
    throw new Error("Destructive test operations require fixture-specific TENANT-UAT-* identities.");
  }
}

export interface SupabasePhaseC2Harness { admin: SupabaseClient; anonymous: SupabaseClient; environmentId: string }
export function createSupabasePhaseC2Harness(configuration = readSupabasePhaseC2TestConfiguration()): SupabasePhaseC2Harness {
  assertSafeSupabaseTestConfiguration(configuration);
  return {
    admin: createClient(configuration.url, configuration.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    anonymous: createClient(configuration.url, configuration.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    environmentId: configuration.environmentId,
  };
}
