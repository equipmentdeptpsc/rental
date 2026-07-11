import {
  MasterToolbar,
} from "@/components/master-data";

interface Props {

  keyword: string;

  onKeywordChange(
    value: string
  ): void;

  onCreate(): void;

  onImport?(): void;

  onExportExcel?(): void;

  onExportCsv?(): void;

  onDownloadTemplate?(): void;

}

export default function CostCodeToolbar({

  keyword,

  onKeywordChange,

  onCreate,

  onImport,

  onExportExcel,

  onExportCsv,

  onDownloadTemplate,

}: Props) {

  return (

    <MasterToolbar

      keyword={keyword}

      onKeywordChange={onKeywordChange}

      createLabel="Cost Code"

      onCreate={onCreate}

      onImport={onImport}

      onExport={onExportExcel}

      onExportCsv={onExportCsv}

      onDownloadTemplate={onDownloadTemplate}

    />

  );

}