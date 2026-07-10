import {
    AlertTriangle,
    CheckCircle2,
  } from "lucide-react";
  
  import type {
    ImportColumnDefinition,
    WizardStepProps,
  } from "./wizardTypes";
  
  interface Props<T>
    extends WizardStepProps<T> {
  
    columns: ImportColumnDefinition<T>[];
  
  }
  
  export default function ImportWizardPreviewStep<T extends object>({
  
    state,
  
    columns,
  
  }: Props<T>) {
  
    if (
  
      state.previewRows.length === 0
  
    ) {
  
      return (
  
        <div className="rounded-lg border bg-white p-6">
  
          <p className="text-slate-500">
  
            No records available for preview.
  
          </p>
  
        </div>
  
      );
  
    }
  
    return (
  
      <div className="space-y-5">
  
        <div>
  
          <h3 className="text-lg font-semibold">
  
            Import Preview
  
          </h3>
  
          <p className="mt-1 text-sm text-slate-500">
  
            Review imported records before committing them.
  
          </p>
  
        </div>
  
        <div className="overflow-auto rounded-lg border">
  
          <table className="min-w-full border-collapse">
  
            <thead className="bg-slate-100">
  
              <tr>
  
                <th className="border px-3 py-2 text-left">
  
                  #
  
                </th>
  
                <th className="border px-3 py-2 text-center">
  
                  Status
  
                </th>
  
                {columns.map(column => (
  
                  <th
  
                    key={String(column.field)}
  
                    className="border px-3 py-2 text-left whitespace-nowrap"
  
                  >
  
                    {column.header}
  
                  </th>
  
                ))}
  
              </tr>
  
            </thead>
  
            <tbody>
  
              {state.previewRows.map(row => {
  
                const source =
                  row.data as Record<
                    string,
                    unknown
                  >;
  
                return (
  
                  <tr
  
                    key={row.index}
  
                    className={
  
                      row.hasError
  
                        ? "bg-red-50"
  
                        : row.hasWarning
  
                        ? "bg-yellow-50"
  
                        : ""
  
                    }
  
                  >
  
                    <td className="border px-3 py-2">
  
                      {row.index}
  
                    </td>
  
                    <td className="border px-3 py-2 text-center">
  
                      {row.hasError ? (
  
                        <AlertTriangle
  
                          size={18}
  
                          className="mx-auto text-red-600"
  
                        />
  
                      ) : (
  
                        <CheckCircle2
  
                          size={18}
  
                          className="mx-auto text-green-600"
  
                        />
  
                      )}
  
                    </td>
  
                    {columns.map(column => (
  
                      <td
  
                        key={String(column.field)}
  
                        className="border px-3 py-2 whitespace-nowrap"
  
                      >
  
                        {String(
  
                          source[
  
                            String(
  
                              column.field
  
                            )
  
                          ] ?? ""
  
                        )}
  
                      </td>
  
                    ))}
  
                  </tr>
  
                );
  
              })}
  
            </tbody>
  
          </table>
  
        </div>
  
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
  
          Showing
  
          <span className="font-semibold">
  
            {" "}
  
            {state.previewRows.length}
  
            {" "}
  
          </span>
  
          record(s) ready for import.
  
        </div>
  
      </div>
  
    );
  
  }