import { useCallback, useEffect, useState } from "react";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { CanonicalRentalReferenceData, CanonicalRentalWorkspace } from "./contracts";
import { subscribeCanonicalRentalRefresh } from "./canonicalRentalRefresh";

export type CanonicalRemoteLoadState<T> = { status: "inactive" | "loading" } | { status: "loaded"; data: T } | { status: "error"; message: string };

function useCanonicalRead<T>(load: (() => Promise<{ success: true; value: T } | { success: false; message: string }>) | undefined): CanonicalRemoteLoadState<T> & { retry(): void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CanonicalRemoteLoadState<T>>(load ? { status: "loading" } : { status: "inactive" });
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => subscribeCanonicalRentalRefresh(retry), [retry]);
  useEffect(() => {
    if (!load) { setState({ status: "inactive" }); return; }
    let active = true; setState({ status: "loading" });
    void load().then(result => { if (active) setState(result.success ? { status: "loaded", data: result.value } : { status: "error", message: result.message }); }).catch(() => { if (active) setState({ status: "error", message: "Canonical Rental data could not be loaded. Retry the request or contact support." }); });
    return () => { active = false; };
  }, [attempt, load]);
  return { ...state, retry };
}

export function useCanonicalRentalWorkspace(rentalId: string) {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const repository = configuration.persistenceMode === PersistenceMode.Remote ? commandRepositories.canonicalRental : undefined;
  const load = useCallback(() => repository!.readWorkspace(rentalId), [rentalId, repository]);
  return useCanonicalRead<CanonicalRentalWorkspace>(repository && rentalId ? load : undefined);
}

export function useCanonicalRentalReferenceData() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const repository = configuration.persistenceMode === PersistenceMode.Remote ? commandRepositories.canonicalRental : undefined;
  const load = useCallback(() => repository!.readReferenceData(), [repository]);
  return useCanonicalRead<CanonicalRentalReferenceData>(repository ? load : undefined);
}
