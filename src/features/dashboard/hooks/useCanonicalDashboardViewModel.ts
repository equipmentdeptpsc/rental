import { useEffect, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { readCanonicalDashboard, type CanonicalDashboardModel } from "../services/canonicalDashboardRead";

export type CanonicalDashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; model: CanonicalDashboardModel; loadedAt: Date };

export function useCanonicalDashboardViewModel(refreshKey: number, canReadAudit: boolean, canReadFinancial = false): CanonicalDashboardState {
  const dependencies = useApplicationDependenciesCompatibility();
  const [state, setState] = useState<CanonicalDashboardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void readCanonicalDashboard(dependencies, { canReadAudit, canReadFinancial, signal: controller.signal })
      .then((model) => { if (!controller.signal.aborted) setState({ status: "loaded", model, loadedAt: new Date() }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ status: "error", message: error instanceof Error ? error.message : "Dashboard data could not be loaded." }); });
    return () => controller.abort();
  }, [dependencies, refreshKey, canReadAudit, canReadFinancial]);

  return state;
}
