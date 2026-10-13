import { useEffect, useState } from "react";
import type { DeurActivityLog, DeurRecord } from "../types";
import { formatElapsedTime, getDeurActivityElapsedSeconds } from "../services/getDeurActivityElapsedSeconds";
import { describeCanonicalCurrentActivity } from "../services/describeCanonicalCurrentActivity";

type Props = { deur: DeurRecord; equipment?: string } | { logs: DeurActivityLog[]; workDate: string; evaluatedAt?: Date };

export default function CurrentActivityCard(props: Props) {
  const legacyLog = "logs" in props ? props.logs.at(-1) : undefined;
  const [internalNow, setInternalNow] = useState(() => new Date());
  useEffect(() => {
    if (!legacyLog || legacyLog.endTime || ("evaluatedAt" in props && props.evaluatedAt)) return;
    const timer = window.setInterval(() => setInternalNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, [legacyLog?.id, legacyLog?.endTime, "evaluatedAt" in props ? props.evaluatedAt : undefined]);
  const current = "deur" in props ? describeCanonicalCurrentActivity(props.deur) : undefined;
  const legacyElapsed = legacyLog && "workDate" in props
    ? formatElapsedTime(getDeurActivityElapsedSeconds(legacyLog, props.workDate, props.evaluatedAt ?? internalNow))
    : undefined;
  return <section className="rounded-xl border bg-white p-6 shadow-sm" aria-label="Current Activity">
    <h2 className="text-lg font-semibold">Current Activity</h2>
    <p className="mt-6 text-2xl font-bold text-blue-700">{current?.label ?? legacyLog?.activity ?? "No activity recorded"}</p>
    {"deur" in props ? <p className="mt-2 text-sm text-slate-600">Work date: {props.deur.workDate}{props.equipment ? ` · ${props.equipment}` : ""}</p> : legacyLog ? <p className="mt-2 text-sm text-slate-600">Started {legacyLog.startTime}</p> : null}
    {current?.occurredAt && <p className="mt-2 text-sm text-slate-600">Last canonical event: {new Date(current.occurredAt).toLocaleString()}</p>}
    {legacyElapsed && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-center font-mono text-2xl" aria-label="Current activity elapsed time">{legacyElapsed}</p>}
  </section>;
}
