import ResponsiveTable from "@/components/ui/ResponsiveTable";

import type {
    DeurActivityLog,
  } from "../types";
  
  interface Props {
    logs: DeurActivityLog[];
  }
  
  export default function ActivityTimeline({
    logs,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white shadow-sm">
  
        <div className="border-b px-6 py-4">
  
          <h2 className="text-lg font-semibold">
            Today's Activity Timeline
          </h2>
  
        </div>
  
        {logs.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            No activity recorded.
          </div>
        ) : (
          <ResponsiveTable>
          <table className="min-w-full">
  
            <thead className="bg-slate-100">
  
              <tr>
  
                <th className="px-4 py-3 text-left">
                  Start
                </th>
  
                <th className="px-4 py-3 text-left">
                  End
                </th>
  
                <th className="px-4 py-3 text-left">
                  Activity
                </th>
  
                <th className="px-4 py-3 text-right">
                  Duration
                </th>
  
              </tr>
  
            </thead>
  
            <tbody>
  
              {logs.map((log) => (
  
                <tr
                  key={log.id}
                  className="border-t"
                >
  
                  <td className="px-4 py-3">
                    {log.startTime}
                  </td>
  
                  <td className="px-4 py-3">
                    {log.endTime ?? "-"}
                  </td>
  
                  <td className="px-4 py-3 font-medium">
                    {log.activity}
                  </td>
  
                  <td className="px-4 py-3 text-right">
  
                    {log.durationMinutes} mins
  
                  </td>
  
                </tr>
  
              ))}
  
            </tbody>
  
          </table>
          </ResponsiveTable>
        )}
  
      </div>
    );
  }
