import type {
    ReactNode,
  } from "react";
  
  interface ImportError {
  
    row: number;
  
    field: string;
  
    message: string;
  
  }
  
  interface Props<T> {
  
    open: boolean;
  
    title?: string;
  
    records: T[];
  
    errors: ImportError[];
  
    children?: ReactNode;
  
    onCancel(): void;
  
    onConfirm(): void;
  
  }
  
  export default function MasterImportPreview<T>({
  
    open,
  
    title = "Import Preview",
  
    records,
  
    errors,
  
    children,
  
    onCancel,
  
    onConfirm,
  
  }: Props<T>) {
  
    if (!open) {
  
      return null;
  
    }
  
    const validRows =
  
      Math.max(
  
        records.length -
  
        errors.length,
  
        0
  
      );
  
    return (
  
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
  
        <div className="w-full max-w-6xl rounded-xl bg-white shadow-xl">
  
          <div className="flex items-center justify-between border-b p-4">
  
            <h2 className="text-lg font-semibold">
  
              {title}
  
            </h2>
  
          </div>
  
          <div className="space-y-6 p-6">
  
            <div className="grid grid-cols-4 gap-4">
  
              <SummaryCard
  
                title="Rows"
  
                value={records.length}
  
              />
  
              <SummaryCard
  
                title="Valid"
  
                value={validRows}
  
                className="text-green-600"
  
              />
  
              <SummaryCard
  
                title="Errors"
  
                value={errors.length}
  
                className="text-red-600"
  
              />
  
              <SummaryCard
  
                title="Ready"
  
                value={
  
                  errors.length === 0
  
                    ? "YES"
  
                    : "NO"
  
                }
  
              />
  
            </div>
  
            {children}
  
            {
  
              errors.length > 0 && (
  
                <div className="rounded-lg border">
  
                  <div className="border-b bg-red-50 p-3 font-medium">
  
                    Validation Errors
  
                  </div>
  
                  <div className="max-h-72 overflow-auto">
  
                    <table className="min-w-full text-sm">
  
                      <thead className="bg-slate-100">
  
                        <tr>
  
                          <th className="px-4 py-2 text-left">
  
                            Row
  
                          </th>
  
                          <th className="px-4 py-2 text-left">
  
                            Field
  
                          </th>
  
                          <th className="px-4 py-2 text-left">
  
                            Message
  
                          </th>
  
                        </tr>
  
                      </thead>
  
                      <tbody>
  
                        {
  
                          errors.map(
  
                            (
  
                              error,
  
                              index
  
                            ) => (
  
                              <tr
  
                                key={index}
  
                                className="border-t"
  
                              >
  
                                <td className="px-4 py-2">
  
                                  {error.row}
  
                                </td>
  
                                <td className="px-4 py-2">
  
                                  {error.field}
  
                                </td>
  
                                <td className="px-4 py-2 text-red-600">
  
                                  {error.message}
  
                                </td>
  
                              </tr>
  
                            )
  
                          )
  
                        }
  
                      </tbody>
  
                    </table>
  
                  </div>
  
                </div>
  
              )
  
            }
  
          </div>
  
          <div className="flex justify-end gap-2 border-t p-4">
  
            <button
  
              onClick={onCancel}
  
              className="rounded border px-4 py-2 hover:bg-slate-100"
  
            >
  
              Cancel
  
            </button>
  
            <button
  
              disabled={errors.length > 0}
  
              onClick={onConfirm}
  
              className={`rounded px-4 py-2 text-white ${
  
                errors.length === 0
  
                  ? "bg-blue-600 hover:bg-blue-700"
  
                  : "cursor-not-allowed bg-slate-400"
  
              }`}
  
            >
  
              Import Records
  
            </button>
  
          </div>
  
        </div>
  
      </div>
  
    );
  
  }
  
  interface SummaryCardProps {
  
    title: string;
  
    value: ReactNode;
  
    className?: string;
  
  }
  
  function SummaryCard({
  
    title,
  
    value,
  
    className,
  
  }: SummaryCardProps) {
  
    return (
  
      <div className="rounded-lg border p-4">
  
        <div className="text-sm text-slate-500">
  
          {title}
  
        </div>
  
        <div className={`mt-2 text-2xl font-bold ${className ?? ""}`}>
  
          {value}
  
        </div>
  
      </div>
  
    );
  
  }