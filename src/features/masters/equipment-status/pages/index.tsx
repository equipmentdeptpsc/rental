import {
    useMemo,
    useState,
  } from "react";
  
  import {
    MasterDrawer,
    MasterPageLayout,
  } from "@/components/master-data";
  
  import MasterImportWizard
    from "@/components/master-data/import-wizard/MasterImportWizard";
  
  import EquipmentStatusToolbar
    from "../components/EquipmentStatusToolbar";
  
  import EquipmentStatusTable
    from "../components/EquipmentStatusTable";
  
  import EquipmentStatusForm
    from "../components/EquipmentStatusForm";
  
  import {
    useEquipmentStatuses,
  } from "../context";
  
  import type {
    EquipmentStatusRecord,
  } from "../types";
  
  import {
    exportToExcel,
  } from "@/shared/import-export/excelExport";
  
  import {
    exportToCsv,
  } from "@/shared/import-export/csvExport";
  
  import {
    generateTemplate,
  } from "@/shared/import-export/templateGenerator";
  
  import equipmentStatusImportConfig
    from "../import/equipmentStatusImportConfig";
  
  import bulkCreateEquipmentStatuses
    from "../import/bulkCreateEquipmentStatuses";
  
  export default function EquipmentStatusPage() {
  
    const {
      records,
      create,
      update,
      remove,
      refresh,
      retry,
      loadState,
      error,
      readOnly,
    } = useEquipmentStatuses();
  
    const [
  
      keyword,
  
      setKeyword,
  
    ] = useState("");
  
    const [
  
      drawerOpen,
  
      setDrawerOpen,
  
    ] = useState(false);
  
    const [
  
      importOpen,
  
      setImportOpen,
  
    ] = useState(false);
  
    const [
  
      editing,
  
      setEditing,
  
    ] =
      useState<EquipmentStatusRecord | null>(
        null,
      );
  
    const filtered =
      useMemo(
  
        () =>
  
          records.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.status
  
                  .toLowerCase()
  
                  .includes(
  
                    keyword.toLowerCase()
  
                  )
  
                ||
  
                item.description
  
                  .toLowerCase()
  
                  .includes(
  
                    keyword.toLowerCase()
  
                  )
  
              )
  
          ),
  
        [
  
          records,
  
          keyword,
  
        ],
  
      );
  
    function openCreate() {
  
      setEditing(null);
  
      setDrawerOpen(true);
  
    }
  
    function openEdit(
  
      record: EquipmentStatusRecord,
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
  
      record: EquipmentStatusRecord,
  
    ) {
  
      if (editing) {
  
        update(record);
  
      }
  
      else {
  
        create(record);
  
      }
  
      setDrawerOpen(false);
  
    }
  
    function handleImport(
  
      imported: any[],
  
    ) {
  
      bulkCreateEquipmentStatuses(
  
        imported,
  
      );
  
    }
  
    function handleImportCompleted() {
  
      refresh();
  
      setImportOpen(false);
  
    }
  
    function exportExcel() {
  
      exportToExcel(
  
        filtered,
  
        {
  
          fileName:
  
            "Equipment Statuses",
  
          sheetName:
  
            "Equipment Statuses",
  
          columns: {
  
            status:
  
              "Equipment Status",
  
            description:
  
              "Description",
  
            active:
  
              "Active",
  
          },
  
        },
  
      );
  
    }
  
    function exportCsv() {
  
      exportToCsv(
  
        filtered,
  
        {
  
          fileName:
  
            "Equipment Statuses",
  
          columns: {
  
            status:
  
              "Equipment Status",
  
            description:
  
              "Description",
  
            active:
  
              "Active",
  
          },
  
        },
  
      );
  
    }
  
    function downloadTemplate() {
  
      generateTemplate(
  
        [
  
          {
  
            header:
  
              "Equipment Status",
  
            required: true,
  
            sample:
  
              "Available",
  
            description:
  
              "Equipment Status",
  
          },
  
          {
  
            header:
  
              "Description",
  
            required: true,
  
            sample:
  
              "Equipment ready for rental",
  
            description:
  
              "Description",
  
          },
  
          {
  
            header:
  
              "Active",
  
            required: false,
  
            sample: true,
  
            description:
  
              "TRUE or FALSE",
  
          },
  
        ],
  
        {
  
          fileName:
  
            "Equipment Status Template",
  
        },
  
      );
  
    }
    return (

        <>
    
          <MasterPageLayout
    
            title="Equipment Status Master"
    
            toolbar={
    
              <EquipmentStatusToolbar
    
                keyword={keyword}
    
                onKeywordChange={setKeyword}
    
                onCreate={openCreate}
    
                onImport={() =>
    
                  setImportOpen(true)
    
                }
    
                onExportExcel={
    
                  exportExcel
    
                }
    
                onExportCsv={
    
                  exportCsv
    
                }
    
                onDownloadTemplate={
    
                  downloadTemplate
    
                }
    
              />
    
            }

            form={
              loadState === "loading" ? <div className="rounded border bg-white p-4 text-sm text-slate-600">Loading Equipment Status records…</div> :
              loadState === "error" ? <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error?.message ?? "Equipment Status records could not be loaded."}</p><button type="button" className="mt-2 rounded border border-red-300 px-3 py-1" onClick={retry}>Retry</button></div> :
              readOnly ? <div className="rounded border bg-slate-50 p-3 text-sm text-slate-600">Remote Equipment Status mode is read-only.</div> : undefined
            }
    
            table={
    
              <EquipmentStatusTable
    
                records={filtered}
    
                onEdit={openEdit}
    
                onDelete={remove}
    
              />
    
            }
    
          />
    
          <MasterDrawer
    
            open={drawerOpen}
    
            title={
    
              editing
    
                ? "Edit Equipment Status"
    
                : "New Equipment Status"
    
            }
    
            onClose={() =>
    
              setDrawerOpen(false)
    
            }
    
          >
    
            <EquipmentStatusForm
    
              editing={editing}
    
              onSave={save}
    
              onCancel={() =>
    
                setDrawerOpen(false)
    
              }
    
            />
    
          </MasterDrawer>
    
          <MasterImportWizard
    
            open={importOpen}
    
            title="Import Equipment Statuses"
    
            columns={
    
              equipmentStatusImportConfig.columns
    
            }
    
            onImport={
    
              handleImport
    
            }
    
            onCompleted={
    
              handleImportCompleted
    
            }
    
            onClose={() =>
    
              setImportOpen(false)
    
            }
    
          />
    
        </>
    
      );
    
    }
