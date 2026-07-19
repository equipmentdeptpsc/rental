import { useEffect, useState } from "react";

import {
  formatElapsedTime,
  getDeurActivityElapsedSeconds,
} from "../services/getDeurActivityElapsedSeconds";
import type {
  DeurActivityLog,
} from "../types";

interface Props {
  logs: DeurActivityLog[];
  workDate: string;
  evaluatedAt?: Date;
}

export default function CurrentActivityCard({
  logs,
  workDate,
  evaluatedAt,
}: Props) {
  const current =
    logs.at(-1);

  const [internalNow, setInternalNow] = useState(() => new Date());

  useEffect(() => {
    if (evaluatedAt || !current || current.endTime) return;

    setInternalNow(new Date());
    const timer = window.setInterval(() => setInternalNow(new Date()), 1_000);

    return () => window.clearInterval(timer);
  }, [current?.id, current?.endTime, evaluatedAt]);

  const now = evaluatedAt ?? internalNow;

  const elapsed = current
    ? formatElapsedTime(getDeurActivityElapsedSeconds(current, workDate, now))
    : undefined;

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <h2 className="text-lg font-semibold">
        Current Activity
      </h2>

      {!current ? (

        <div className="mt-6 text-slate-500">
          Waiting for operator to arrive at site.
        </div>

      ) : (

        <>

          <div className="mt-6 text-3xl font-bold text-blue-700">

            {current.activity}

          </div>

          <div className="mt-2 text-slate-600">

            Started

            {" "}

            {current.startTime}

          </div>

          <div
            className="mt-6 rounded-lg bg-slate-100 p-3 text-center font-mono text-2xl font-semibold text-slate-700"
            aria-label="Current activity elapsed time"
            aria-live="off"
          >
            {elapsed}

          </div>

        </>

      )}

    </div>
  );
}
