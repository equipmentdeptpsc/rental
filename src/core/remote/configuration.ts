import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";

export type RemoteSource = "local" | "supabase";
export interface RemoteRuntimeConfiguration { source: RemoteSource; supabaseUrl?: string; supabasePublishableKey?: string }
export interface RemoteEnvironment { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }

export function readRemoteConfiguration(environment: RemoteEnvironment,sourceValue?:string): RemoteRuntimeConfiguration { return { source: sourceValue === "supabase" ? "supabase" : "local", supabaseUrl: environment.VITE_SUPABASE_URL, supabasePublishableKey: environment.VITE_SUPABASE_PUBLISHABLE_KEY }; }
export function validateSupabaseConfiguration(configuration: RemoteRuntimeConfiguration): RepositoryResult<{ url: string; publishableKey: string }> {
  if (configuration.source !== "supabase") return repositoryFailure("REMOTE_SOURCE_NOT_ENABLED", "Supabase remote mode is not enabled.", { context: { source: configuration.source }, recommendedAction: "Enable the intended remote source explicitly." });
  if (!configuration.supabaseUrl || !configuration.supabasePublishableKey) return repositoryFailure("SUPABASE_CONFIGURATION_MISSING", "Supabase remote mode requires browser-safe project configuration.", { context: { required: "VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY" }, recommendedAction: "Provide the Vite Supabase URL and publishable key, or select local mode." });
  try { const url = new URL(configuration.supabaseUrl); if (url.protocol !== "https:") throw new Error(); } catch { return repositoryFailure("SUPABASE_CONFIGURATION_INVALID", "Supabase URL must be a valid HTTPS URL.", { recommendedAction: "Correct VITE_SUPABASE_URL." }); }
  return repositorySuccess({ url: configuration.supabaseUrl, publishableKey: configuration.supabasePublishableKey });
}
