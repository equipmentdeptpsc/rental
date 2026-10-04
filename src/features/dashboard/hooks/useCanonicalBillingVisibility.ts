import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility, PersistenceMode } from "@/app/composition";
import type { CanonicalBillingVisibility } from "../services/canonicalBillingVisibility";
import { summarizeCanonicalBillingVisibility } from "../services/canonicalBillingVisibility";
import { readAllCanonicalPages } from "../services/canonicalDashboardRead";

export type CanonicalBillingVisibilityState =
  | { status: "unavailable" | "loading"; data?: undefined; retry(): void }
  | { status: "loaded"; data: CanonicalBillingVisibility; retry(): void }
  | { status: "error"; data?: undefined; retry(): void };

export function useCanonicalBillingVisibility(enabled: boolean, refreshKey = 0): CanonicalBillingVisibilityState {
  const { configuration, readRepositories } = useApplicationDependenciesCompatibility();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<CanonicalBillingVisibilityState, "retry">>({ status: "unavailable" });
  const retry = () => setAttempt((value) => value + 1);
  const canonical = enabled && configuration.persistenceMode === PersistenceMode.Remote;

  useEffect(() => {
    if (!canonical) { setState({ status: "unavailable" }); return; }
    let active = true;
    const controller = new AbortController();
    setState({ status: "loading" });
    void readAllCanonicalPages(readRepositories.deurs, controller.signal).then((deurs) => {
      if (!active) return;
      setState({ status: "loaded", data: summarizeCanonicalBillingVisibility(deurs) });
    }).catch(() => { if (active) setState({ status: "error" }); });
    return () => { active = false; controller.abort(); };
  }, [attempt, canonical, readRepositories.deurs, refreshKey]);

  return { ...state, retry } as CanonicalBillingVisibilityState;
}
