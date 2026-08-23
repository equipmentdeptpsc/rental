import { useCallback, useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { subscribeCanonicalOperatorRefresh } from "@/features/operators/remote/canonicalOperatorRefresh";

export interface CanonicalOperatorProjection {
  id: string;
  name: string;
  status: string;
  email?: string;
  licenseNumber?: string;
  certificationType?: string;
  active: boolean;
  deleted: boolean;
}

type State = { status: "loading" | "loaded"; items: CanonicalOperatorProjection[] } | { status: "error"; items: CanonicalOperatorProjection[]; message: string };
const text = (value: unknown) => typeof value === "string" ? value : undefined;

export function useCanonicalOperatorData() {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => subscribeCanonicalOperatorRefresh(retry), [retry]);
  useEffect(() => {
    let active = true;
    setState({ status: "loading", items: [] });
    void Promise.resolve(readRepositories.operators.list()).then((result) => {
      if (!active) return;
      if (!result.success) return setState({ status: "error", items: [], message: "Canonical Operator data could not be loaded." });
      setState({ status: "loaded", items: result.value.items.map((record) => {
        const row = record as unknown as Record<string, unknown>;
        return { id: record.id, name: record.name, status: record.status, email: text(row.email), licenseNumber: text(row.licenseNumber), certificationType: text(row.certificationType), active: record.status === "Active", deleted: row.deletedAt !== null && row.deletedAt !== undefined };
      }) });
    }).catch(() => { if (active) setState({ status: "error", items: [], message: "Canonical Operator data could not be loaded." }); });
    return () => { active = false; };
  }, [attempt, readRepositories.operators]);
  return { ...state, retry };
}
