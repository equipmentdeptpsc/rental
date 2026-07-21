import ResponsiveTable from "@/components/ui/ResponsiveTable";

import type {
  BillingPreviewLine,
} from "../types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { getDeurPreviewReference } from "../BillingPreviewBuilder";

import BillingLineRow from "./BillingLineRow";

interface Props {
  lines: BillingPreviewLine[];
  completedDeurs?: DeurRecord[];
  rateUnavailable?: boolean;
}

export default function BillingPreviewTable({
  lines,
  completedDeurs = [],
  rateUnavailable = false,
}: Props) {

  const subtotal =
    lines.reduce(
      (total, line) =>
        total + line.amount,
      0
    );

  if (
    lines.length === 0
  ) {
    if (completedDeurs.length > 0) {
      return (
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">Completed DEUR records</h2>
          {rateUnavailable && (
            <p className="mt-1 text-sm text-slate-500">
              Billing rate not configured. DEUR evidence is available, but amounts cannot be calculated yet.
            </p>
          )}
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {completedDeurs.map((deur) => (
              <div key={deur.id} className="flex flex-wrap justify-between gap-2 rounded border p-3">
                <span>DEUR: {getDeurPreviewReference(deur)}</span>
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

            <th className="px-3 py-3 text-left">Equipment</th>

            <th className="px-3 py-3 text-left">Operator</th>

            <th className="px-3 py-3 text-left">
              DEUR
            </th>

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
              Quantity / Hours
            </th>

            <th className="px-3 py-3 text-right">
              Rate
            </th>

            <th className="px-3 py-3 text-right">
              Amount
            </th>

          </tr>

        </thead>

        <tbody>

          {lines.map(
            (line) => (

              <BillingLineRow
                key={line.deurId}
                line={line}
              />

            )
          )}

        </tbody>

        <tfoot className="bg-slate-50">

          <tr>

            <td
              colSpan={8}
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
