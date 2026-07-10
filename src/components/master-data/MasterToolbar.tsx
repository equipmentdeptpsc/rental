import {
  Download,
  FileDown,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
} from "lucide-react";

interface Props {

  keyword: string;

  onKeywordChange(
    value: string
  ): void;

  createLabel?: string;

  onCreate?(): void;

  /**
   * Existing framework actions
   */

  onImport?(): void;

  onExport?(): void;

  /**
   * Sprint 5.6 additions
   */

  onExportCsv?(): void;

  onDownloadTemplate?(): void;

}

export default function MasterToolbar({

  keyword,

  onKeywordChange,

  createLabel = "Record",

  onCreate,

  onImport,

  onExport,

  onExportCsv,

  onDownloadTemplate,

}: Props) {

  return (

    <div className="rounded-xl border bg-white p-4">

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div className="relative w-full lg:max-w-md">

          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            value={keyword}
            onChange={(e) =>
              onKeywordChange(
                e.target.value
              )
            }
            placeholder="Search..."
            className="w-full rounded-lg border pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

        </div>

        <div className="flex flex-wrap gap-2 justify-end">

          {onDownloadTemplate && (

            <button
              onClick={onDownloadTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >

              <Download size={16} />

              Template

            </button>

          )}

          {onImport && (

            <button
              onClick={onImport}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >

              <Upload size={16} />

              Import

            </button>

          )}

          {onExport && (

            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >

              <FileSpreadsheet size={16} />

              Excel

            </button>

          )}

          {onExportCsv && (

            <button
              onClick={onExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >

              <FileDown size={16} />

              CSV

            </button>

          )}

          {onCreate && (

            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >

              <Plus size={16} />

              New {createLabel}

            </button>

          )}

        </div>

      </div>

    </div>

  );

}