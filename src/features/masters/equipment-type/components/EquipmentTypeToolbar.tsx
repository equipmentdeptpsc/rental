import {
    MasterToolbar,
  } from "@/components/master-data";
  
  interface Props {
  
    keyword: string;
  
    onKeywordChange(
      value: string,
    ): void;
  
    onCreate(): void;
  
    /**
     * Import Wizard
     */
  
    onImport?(): void;
  
    /**
     * Excel Export
     */
  
    onExportExcel?(): void;
  
    /**
     * CSV Export
     */
  
    onExportCsv?(): void;
  
    /**
     * Download Import Template
     */
  
    onDownloadTemplate?(): void;
  
  }
  
  export default function EquipmentTypeToolbar({
  
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
  
        createLabel="Equipment Type"
  
        onImport={onImport}
  
        onExport={onExportExcel}
  
        onExportCsv={onExportCsv}
  
        onDownloadTemplate={onDownloadTemplate}
  
      />
  
    );
  
  }