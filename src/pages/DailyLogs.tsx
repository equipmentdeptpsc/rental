import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import RemoteDailyLogsPage from "@/features/daily-log/components/RemoteDailyLogsPage";

export default function DailyLogs() {
  const { configuration } = useApplicationDependenciesCompatibility();
  if (configuration.persistenceMode === PersistenceMode.Remote) return <RemoteDailyLogsPage />;
  return <div className="p-8"><h1 className="text-3xl font-bold">Daily Logs</h1><p className="mt-2 text-gray-500">Daily Logs Management Module</p></div>;
}
