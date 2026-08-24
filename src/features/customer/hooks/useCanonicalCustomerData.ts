import { useCallback, useEffect, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { CustomerRecord } from "@/features/customer/types";
import { subscribeCanonicalCustomerRefresh } from "@/features/customer/remote/canonicalCustomerRefresh";

type State = { status: "loading" | "loaded"; items: CustomerRecord[] } | { status: "error"; items: CustomerRecord[]; message: string };
export function useCanonicalCustomerData() {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [attempt, setAttempt] = useState(0), [state, setState] = useState<State>({ status: "loading", items: [] });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => subscribeCanonicalCustomerRefresh(retry), [retry]);
  useEffect(() => { let active = true; setState({ status: "loading", items: [] });
    void Promise.resolve(readRepositories.customers.list()).then((result) => { if (!active) return; setState(result.success ? { status: "loaded", items: result.value.items } : { status: "error", items: [], message: "Canonical Customer data could not be loaded." }); }).catch(() => { if (active) setState({ status: "error", items: [], message: "Canonical Customer data could not be loaded." }); });
    return () => { active = false; };
  }, [attempt, readRepositories.customers]);
  return { ...state, retry };
}
