import {
    CheckCircle2,
    AlertTriangle,
    XCircle,
  } from "lucide-react";
  
  import type {
    WizardStepProps,
  } from "./wizardTypes";
  
  export default function ImportWizardValidationStep<T>({
  
    state,
  
  }: WizardStepProps<T>) {
  
    const validation =
      state.validation;

    const blockingErrors = state.blockingErrors ?? [];
  
    if (!validation && blockingErrors.length === 0) {
  
      return (
  
        <div className="rounded-lg border bg-white p-6">
  
          <p className="text-slate-500">
  
            Validation has not been performed yet.
  
          </p>
  
        </div>
  
      );
  
    }

    if (!validation) {
      return (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h4 className="font-semibold text-red-700">Import cannot continue</h4>
          <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
            {blockingErrors.map(error => <li key={error}>{error}</li>)}
          </ul>
        </div>
      );
    }
  
    const validCount =
      validation.validRecords.length;
  
    const invalidCount =
      validation.invalidRecords.length;
  
    const warningCount =
      validation.warnings.length;
  
    return (
  
      <div className="space-y-6">
  
        <div>
  
          <h3 className="text-lg font-semibold">
  
            Validation Results
  
          </h3>
  
          <p className="mt-1 text-sm text-slate-500">
  
            Review the validation summary before continuing.
  
          </p>
  
        </div>

        {blockingErrors.length > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <h4 className="font-semibold text-red-700">Import cannot continue</h4>
            <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
              {blockingErrors.map(error => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}

        {state.isEmptyResult && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
            The file is valid but contains no data rows to import.
          </div>
        )}
  
        <div className="grid gap-4 md:grid-cols-3">
  
          <div className="rounded-lg border bg-green-50 p-4">
  
            <div className="flex items-center gap-3">
  
              <CheckCircle2 className="text-green-600" />
  
              <div>
  
                <div className="text-sm text-slate-600">
  
                  Valid Records
  
                </div>
  
                <div className="text-2xl font-bold text-green-700">
  
                  {validCount}
  
                </div>
  
              </div>
  
            </div>
  
          </div>
  
          <div className="rounded-lg border bg-yellow-50 p-4">
  
            <div className="flex items-center gap-3">
  
              <AlertTriangle className="text-yellow-600" />
  
              <div>
  
                <div className="text-sm text-slate-600">
  
                  Warnings
  
                </div>
  
                <div className="text-2xl font-bold text-yellow-700">
  
                  {warningCount}
  
                </div>
  
              </div>
  
            </div>
  
          </div>
  
          <div className="rounded-lg border bg-red-50 p-4">
  
            <div className="flex items-center gap-3">
  
              <XCircle className="text-red-600" />
  
              <div>
  
                <div className="text-sm text-slate-600">
  
                  Invalid Records
  
                </div>
  
                <div className="text-2xl font-bold text-red-700">
  
                  {invalidCount}
  
                </div>
  
              </div>
  
            </div>
  
          </div>
  
        </div>
  
        {validation.errors.length > 0 && (
  
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
  
            <h4 className="font-semibold text-red-700">
  
              Validation Errors
  
            </h4>
  
            <div className="mt-3 max-h-64 overflow-auto">
  
              <table className="min-w-full text-sm">
  
                <thead>
  
                  <tr className="border-b">
  
                    <th className="px-2 py-1 text-left">
  
                      Row
  
                    </th>
  
                    <th className="px-2 py-1 text-left">
  
                      Column
  
                    </th>
  
                    <th className="px-2 py-1 text-left">
  
                      Message
  
                    </th>
  
                  </tr>
  
                </thead>
  
                <tbody>
  
                  {validation.errors.map(
  
                    (
  
                      error,
  
                      index
  
                    ) => (
  
                      <tr
  
                        key={index}
  
                        className="border-b"
  
                      >
  
                        <td className="px-2 py-1">
  
                          {error.row}
  
                        </td>
  
                        <td className="px-2 py-1">
  
                          {error.column ?? "-"}
  
                        </td>
  
                        <td className="px-2 py-1">
  
                          {error.message}
  
                        </td>
  
                      </tr>
  
                    )
  
                  )}
  
                </tbody>
  
              </table>
  
            </div>
  
          </div>
  
        )}
  
        {validation.warnings.length > 0 && (
  
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
  
            <h4 className="font-semibold text-yellow-700">
  
              Validation Warnings
  
            </h4>
  
            <div className="mt-3 max-h-48 overflow-auto">
  
              <table className="min-w-full text-sm">
  
                <thead>
  
                  <tr className="border-b">
  
                    <th className="px-2 py-1 text-left">
  
                      Row
  
                    </th>
  
                    <th className="px-2 py-1 text-left">
  
                      Column
  
                    </th>
  
                    <th className="px-2 py-1 text-left">
  
                      Message
  
                    </th>
  
                  </tr>
  
                </thead>
  
                <tbody>
  
                  {validation.warnings.map(
  
                    (
  
                      warning,
  
                      index
  
                    ) => (
  
                      <tr
  
                        key={index}
  
                        className="border-b"
  
                      >
  
                        <td className="px-2 py-1">
  
                          {warning.row}
  
                        </td>
  
                        <td className="px-2 py-1">
  
                          {warning.column ?? "-"}
  
                        </td>
  
                        <td className="px-2 py-1">
  
                          {warning.message}
  
                        </td>
  
                      </tr>
  
                    )
  
                  )}
  
                </tbody>
  
              </table>
  
            </div>
  
          </div>
  
        )}
  
      </div>
  
    );
  
  }
