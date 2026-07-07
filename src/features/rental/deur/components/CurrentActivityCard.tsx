import type {
  DeurActivityLog,
} from "../types";

interface Props {
  logs: DeurActivityLog[];
}

export default function CurrentActivityCard({
  logs,
}: Props) {
  const current =
    logs.at(-1);

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

          <div className="mt-6 rounded-lg bg-slate-100 p-3 text-center text-sm text-slate-600">

            Live timer will be added in the next milestone.

          </div>

        </>

      )}

    </div>
  );
}