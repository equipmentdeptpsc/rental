/** Isolates the legacy test-compatibility switch from feature/domain modules. */
export function isTestRuntime(): boolean { return import.meta.env.MODE === "test"; }
