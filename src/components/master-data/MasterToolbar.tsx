import type {
  ChangeEvent,
} from "react";

interface Props {

  keyword: string;

  onKeywordChange(
    value: string
  ): void;

  onCreate(): void;

  createLabel: string;

  enableImport?: boolean;

  enableExport?: boolean;

  enableTemplate?: boolean;

  onImport?(): void;

  onExport?(): void;

  onDownloadTemplate?(): void;

}

export default function MasterToolbar({

  keyword,

  onKeywordChange,

  onCreate,

  createLabel,

  enableImport = false,

  enableExport = false,

  enableTemplate = false,

  onImport,

  onExport,

  onDownloadTemplate,

}: Props) {

  function changeKeyword(
    e: ChangeEvent<HTMLInputElement>
  ) {

    onKeywordChange(
      e.target.value
    );

  }

  return (

    <div className="flex flex-col gap-4 rounded-xl border bg-white p-4 lg:flex-row lg:items-center lg:justify-between">

      <input
        type="text"
        placeholder="Search..."
        value={keyword}
        onChange={changeKeyword}
        className="w-full rounded-lg border px-3 py-2 lg:max-w-sm"
      />

      <div className="flex flex-wrap gap-2">

        {enableTemplate && (

          <button
            type="button"
            onClick={onDownloadTemplate}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
          >

            Download Template

          </button>

        )}

        {enableImport && (

          <button
            type="button"
            onClick={onImport}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
          >

            Import

          </button>

        )}

        {enableExport && (

          <button
            type="button"
            onClick={onExport}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
          >

            Export

          </button>

        )}

        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >

          New {createLabel}

        </button>

      </div>

    </div>

  );

}