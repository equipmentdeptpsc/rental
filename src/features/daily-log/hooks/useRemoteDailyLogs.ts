import { useEffect, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { readRemoteDailyLogs, type RemoteDailyLogsModel } from "../services/remoteDailyLogs";

export type RemoteDailyLogsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; model: RemoteDailyLogsModel; refreshing?: boolean };

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function useRemoteDailyLogs(refreshKey: number): RemoteDailyLogsState {
  const dependencies = useApplicationDependenciesCompatibility();
  const [state, setState] = useState<RemoteDailyLogsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    setState((current) =>
      current.status === "loaded"
        ? { ...current, refreshing: true }
        : { status: "loading" },
    );

    void readRemoteDailyLogs(dependencies, {
      signal: controller.signal,
      today: localDate(),
    })
      .then((model) => {
        if (!controller.signal.aborted) {
          setState({
            status: "loaded",
            model,
            refreshing: false,
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Daily Logs could not be loaded.",
          });
        }
      });

    return () => controller.abort();
  }, [dependencies, refreshKey]);

  return state;
}