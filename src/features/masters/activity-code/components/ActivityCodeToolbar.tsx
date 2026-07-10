import {
  MasterToolbar,
} from "@/components/master-data";

interface Props {

  keyword: string;

  onKeywordChange(
    value: string
  ): void;

  onCreate(): void;

  /**
   * Optional until pages/index.tsx
   * is upgraded.
   */

  onImport?(): void;

  onExportExcel?(): void;

  onExportCsv?(): void;

  onDownloadTemplate?(): void;

}

export default function ActivityCodeToolbar({

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

      onCreate={onCreate}

      createLabel="Activity Code"

      onImport={onImport}

      onExport={onExportExcel}

      onExportCsv={onExportCsv}

      onDownloadTemplate={onDownloadTemplate}

    />

  );

}