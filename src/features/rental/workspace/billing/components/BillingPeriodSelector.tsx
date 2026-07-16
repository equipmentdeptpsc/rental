interface Props {
    from: string;
  
    to: string;
  
    onFromChange(
      value: string
    ): void;
  
    onToChange(
      value: string
    ): void;
  
    onGenerate(): void;
  
    onSaveDraft(): void;

    canGenerate: boolean;

    canCreate: boolean;

    createUnavailableMessage?: string;
  }
  
  export default function BillingPeriodSelector({
    from,
    to,
    onFromChange,
    onToChange,
    onGenerate,
    onSaveDraft,
    canGenerate,
    canCreate,
    createUnavailableMessage,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 space-y-4">
  
        <h2 className="text-lg font-semibold">
          Billing Period
        </h2>
  
        <div className="grid gap-4 md:grid-cols-2">
  
          <div>
  
            <label className="text-sm font-medium">
              From
            </label>
  
            <input
              type="date"
              value={from}
              onChange={(e) =>
                onFromChange(
                  e.target.value
                )
              }
              className="mt-1 w-full rounded border px-3 py-2"
            />
  
          </div>
  
          <div>
  
            <label className="text-sm font-medium">
              To
            </label>
  
            <input
              type="date"
              value={to}
              onChange={(e) =>
                onToChange(
                  e.target.value
                )
              }
              className="mt-1 w-full rounded border px-3 py-2"
            />
  
          </div>
  
        </div>
  
        <div className="flex flex-wrap gap-3">
  
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white"
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            Generate Billing
          </button>

          {!canGenerate && <p className="text-sm text-slate-500">{createUnavailableMessage}</p>}
  
          {canCreate ? (
            <button
              className="rounded bg-green-600 px-4 py-2 text-white"
              onClick={onSaveDraft}
            >
              Create Billing Statement
            </button>
          ) : (
            <p className="text-sm text-slate-500">
              {createUnavailableMessage ?? "Billing statement creation is unavailable."}
            </p>
          )}
  
        </div>
  
      </div>
    );
  }
