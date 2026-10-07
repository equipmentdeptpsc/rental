import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";

const NewDailyLog = lazy(() => import("./New"));

export default function DailyLogNewRoute() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return configuration.persistenceMode === PersistenceMode.Remote ? <Navigate to="/daily-logs" replace /> : <Suspense fallback={<div role="status">Loading Daily Log form…</div>}><NewDailyLog /></Suspense>;
}
