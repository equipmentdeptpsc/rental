import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility, PersistenceMode } from "@/app/composition";
import type { CanonicalBillingVisibility } from "../services/canonicalBillingVisibility";
import { summarizeCanonicalBillingVisibility } from "../services/canonicalBillingVisibility";

export type CanonicalBillingVisibilityState =
  | { status: "unavailable" | "loading"; data?: undefined; retry(): void }
  | { status: "loaded"; data: CanonicalBillingVisibility; retry(): void }
  | { status: "error"; data?: undefined; retry(): void };

export function useCanonicalBillingVisibility(enabled: boolean): CanonicalBillingVisibilityState {
  const { configuration, readRepositories } = useApplicationDependenciesCompatibility();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<CanonicalBillingVisibilityState, "retry">>({ status: "unavailable" });
  const retry = () => setAttempt((value) => value + 1);
  const canonical = enabled && configuration.persistenceMode === PersistenceMode.Remote;

  useEffect(() => {
    if (!canonical) { setState({ status: "unavailable" }); return; }
    let active = true;
    setState({ status: "loading" });
    void Promise.resolve(readRepositories.deurs.list()).then((result) => {
      if (!active) return;
      setState(result.success ? { status: "loaded", data: summarizeCanonicalBillingVisibility(result.value.items) } : { status: "error" });
    }).catch(() => { if (active) setState({ status: "error" }); });
    return () => { active = false; };
  }, [attempt, canonical, readRepositories.deurs]);

  return { ...state, retry } as CanonicalBillingVisibilityState;
}
