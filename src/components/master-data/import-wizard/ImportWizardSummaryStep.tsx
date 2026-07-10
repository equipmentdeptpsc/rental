import {
    CheckCircle2,
    AlertTriangle,
    FileCheck2,
    FileWarning,
  } from "lucide-react";
  
  import type {
    WizardStepProps,
  } from "./wizardTypes";
  
  export default function ImportWizardSummaryStep<T>({
    state,
  }: WizardStepProps<T>) {
  
    const summary = state.summary;
  
    if (!summary) {
      return (
        <div className="rounded-lg border bg-white p-6">
          <p className="text-slate-500">
            Import summary is not available.
          </p>
        </div>
      );
    }
  
    const cards = [
  
      {
        title: "Processed",
        value: summary.totalRows,
        icon: FileCheck2,
        bg: "bg-blue-50",
        text: "text-blue-700",
      },
  
      {
        title: "Imported",
        value: summary.importedRows,
        icon: CheckCircle2,
        bg: "bg-green-50",
        text: "text-green-700",
      },
  
      {
        title: "Skipped",
        value: summary.skippedRows,
        icon: FileWarning,
        bg: "bg-yellow-50",
        text: "text-yellow-700",
      },
  
      {
        title: "Duplicates",
        value: summary.duplicateRows,
        icon: AlertTriangle,
        bg: "bg-orange-50",
        text: "text-orange-700",
      },
  
      {
        title: "Invalid",
        value: summary.invalidRows,
        icon: AlertTriangle,
        bg: "bg-red-50",
        text: "text-red-700",
      },
  
    ];
  
    return (
  
      <div className="space-y-6">
  
        <div>
  
          <h3 className="text-lg font-semibold">
  
            Import Summary
  
          </h3>
  
          <p className="mt-1 text-sm text-slate-500">
  
            Review the overall import results before finishing.
  
          </p>
  
        </div>
  
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
  
          {cards.map(card => {
  
            const Icon = card.icon;
  
            return (
  
              <div
                key={card.title}
                className={`rounded-lg border p-4 ${card.bg}`}
              >
  
                <div className="flex items-center justify-between">
  
                  <div>
  
                    <div className="text-sm text-slate-600">
  
                      {card.title}
  
                    </div>
  
                    <div className={`mt-2 text-3xl font-bold ${card.text}`}>
  
                      {card.value}
  
                    </div>
  
                  </div>
  
                  <Icon
                    size={28}
                    className={card.text}
                  />
  
                </div>
  
              </div>
  
            );
  
          })}
  
        </div>
  
        {summary.invalidRows === 0 ? (
  
          <div className="rounded-lg border border-green-300 bg-green-50 p-5">
  
            <div className="flex items-start gap-3">
  
              <CheckCircle2
                className="mt-1 text-green-700"
              />
  
              <div>
  
                <h4 className="font-semibold text-green-700">
  
                  Ready to Import
  
                </h4>
  
                <p className="mt-1 text-sm text-green-700">
  
                  All validation checks have passed.
  
                  The records are ready to be imported into the system.
  
                </p>
  
              </div>
  
            </div>
  
          </div>
  
        ) : (
  
          <div className="rounded-lg border border-red-300 bg-red-50 p-5">
  
            <div className="flex items-start gap-3">
  
              <AlertTriangle
                className="mt-1 text-red-700"
              />
  
              <div>
  
                <h4 className="font-semibold text-red-700">
  
                  Import Requires Attention
  
                </h4>
  
                <p className="mt-1 text-sm text-red-700">
  
                  Some records failed validation.
  
                  Review the errors before completing the import.
  
                </p>
  
              </div>
  
            </div>
  
          </div>
  
        )}
  
        <div className="rounded-lg border bg-slate-50 p-4">
  
          <table className="w-full text-sm">
  
            <tbody>
  
              <tr>
  
                <td className="py-2 font-medium">
  
                  Total Records
  
                </td>
  
                <td className="py-2 text-right">
  
                  {summary.totalRows}
  
                </td>
  
              </tr>
  
              <tr>
  
                <td className="py-2 font-medium">
  
                  Successfully Imported
  
                </td>
  
                <td className="py-2 text-right">
  
                  {summary.importedRows}
  
                </td>
  
              </tr>
  
              <tr>
  
                <td className="py-2 font-medium">
  
                  Skipped
  
                </td>
  
                <td className="py-2 text-right">
  
                  {summary.skippedRows}
  
                </td>
  
              </tr>
  
              <tr>
  
                <td className="py-2 font-medium">
  
                  Duplicate Records
  
                </td>
  
                <td className="py-2 text-right">
  
                  {summary.duplicateRows}
  
                </td>
  
              </tr>
  
              <tr>
  
                <td className="py-2 font-medium">
  
                  Invalid Records
  
                </td>
  
                <td className="py-2 text-right">
  
                  {summary.invalidRows}
  
                </td>
  
              </tr>
  
            </tbody>
  
          </table>
  
        </div>
  
      </div>
  
    );
  
  }