import { useCallback, useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { subscribeCanonicalProjectRefresh } from "@/features/project/remote/canonicalProjectRefresh";

export interface CanonicalProjectProjection {
  id: string;
  projectCode?: string;
  name: string;
  active: boolean;
  customerId?: string;
  location?: string;
  deleted: boolean;
}

type State = { status: "loading" | "loaded"; items: CanonicalProjectProjection[] } | { status: "error"; items: CanonicalProjectProjection[]; message: string };
const text = (value: unknown) => typeof value === "string" ? value : undefined;

export function useCanonicalProjectData() {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => subscribeCanonicalProjectRefresh(retry), [retry]);
  useEffect(() => {
    let active = true;
    setState({ status: "loading", items: [] });
    void Promise.resolve(readRepositories.projects.list()).then((result) => {
      if (!active) return;
      if (!result.success) return setState({ status: "error", items: [], message: "Canonical Project data could not be loaded." });
      setState({ status: "loaded", items: result.value.items.map((record) => {
        const row = record as unknown as Record<string, unknown>;
        return { id: record.id, projectCode: text(row.projectCode), name: text(row.name) ?? "Unnamed Project", active: row.active === true, customerId: text(row.customerId), location: text(row.location), deleted: row.deletedAt !== null && row.deletedAt !== undefined };
      }) });
    }).catch(() => { if (active) setState({ status: "error", items: [], message: "Canonical Project data could not be loaded." }); });
    return () => { active = false; };
  }, [attempt, readRepositories.projects]);
  return { ...state, retry };
}
