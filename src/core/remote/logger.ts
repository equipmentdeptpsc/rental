export type RemoteLogCategory = "configuration" | "query" | "mapping" | "retry" | "authorization" | "performance";
export interface RemoteLogEvent { category: RemoteLogCategory; message: string; context?: Record<string, unknown> }
export interface RemoteLogger { log(event: RemoteLogEvent): void }
const SENSITIVE = /key|token|password|secret|url|email|name|address|phone/i;
export function redactRemoteLogContext(context: Record<string, unknown> = {}): Record<string, unknown> { return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, SENSITIVE.test(key) ? "[REDACTED]" : value])); }
export function createRemoteLogger(options: { development?: boolean; sink?: (event: RemoteLogEvent) => void } = {}): RemoteLogger {
  return { log(event) { if (!options.development && event.category !== "authorization") return; options.sink?.({ ...event, context: redactRemoteLogContext(event.context) }); } };
}
export const silentRemoteLogger = createRemoteLogger();
