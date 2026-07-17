import { useMemo, useState } from "react";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import type {
  BillingPreviewLine,
} from "../types";
import type { DeurRecord } from "@/features/rental/deur/types";

import BillingLineRow from "./BillingLineRow";

interface Props {
  lines: BillingPreviewLine[];
  completedDeurs?: DeurRecord[];
  awaitingContract?: boolean;
}

export default function BillingPreviewTable({
  lines,
  completedDeurs = [],
  awaitingContract = false,
}: Props) {

  const [billingLines, setBillingLines] =
    useState(lines);

  useMemo(() => {
    setBillingLines(lines);
  }, [lines]);

  function updateLine(
    updated: BillingPreviewLine
  ) {
    setBillingLines((current) =>
      current.map((line) =>
        line.deurId === updated.deurId
          ? updated
          : line
      )
    );
  }

  const subtotal =
    billingLines.reduce(
      (total, line) =>
        total + line.amount,
      0
    );

  if (
    billingLines.length === 0
  ) {
    if (completedDeurs.length > 0) {
      return (
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">Completed DEUR records</h2>
          {awaitingContract && (
            <p className="mt-1 text-sm text-slate-500">
              A rental contract is required before billing amounts can be calculated.
            </p>
          )}
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {completedDeurs.map((deur) => (
              <div key={deur.id} className="flex flex-wrap justify-between gap-2 rounded border p-3">
                <span>{deur.workDate}</span>
                <span>Operating: {deur.totalOperatingMinutes / 60} h</span>
                <span>Idle: {deur.totalIdleMinutes / 60} h</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border bg-white p-6 text-center text-slate-500">

        No DEUR records found for the selected billing period.

      </div>
    );
  }

  return (
    <ResponsiveTable><div className="rounded-xl border bg-white min-w-max">

      <table className="min-w-full text-sm">

        <thead className="bg-slate-100">

          <tr>

            <th className="px-3 py-3 text-left">
              Date
            </th>

            <th className="px-3 py-3 text-left">
              Description
            </th>

            <th className="px-3 py-3 text-left">
              Cost Code
            </th>

            <th className="px-3 py-3 text-right">
              Hours
            </th>

            <th className="px-3 py-3 text-right">
              Hourly Rate
            </th>

            <th className="px-3 py-3 text-right">
              Amount
            </th>

          </tr>

        </thead>

        <tbody>

          {billingLines.map(
            (line) => (

              <BillingLineRow
                key={line.deurId}
                line={line}
                onChange={
                  updateLine
                }
              />

            )
          )}

        </tbody>

        <tfoot className="bg-slate-50">

          <tr>

            <td
              colSpan={5}
              className="px-3 py-3 text-right font-semibold"
            >
              Subtotal
            </td>

            <td className="px-3 py-3 text-right font-bold">

              ₱
              {subtotal.toLocaleString(
                undefined,
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}

            </td>

          </tr>

        </tfoot>

      </table>

    </div></ResponsiveTable>
  );
}
