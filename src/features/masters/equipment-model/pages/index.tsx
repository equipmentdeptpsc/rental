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
  
  import EquipmentModelToolbar
    from "../components/EquipmentModelToolbar";
  
  import EquipmentModelTable
    from "../components/EquipmentModelTable";
  
  import EquipmentModelForm
    from "../components/EquipmentModelForm";
  
  import {
    useEquipmentModels,
  } from "../context";
  
  import type {
    EquipmentModelRecord,
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
  
  import equipmentModelImportConfig
    from "../import/equipmentModelImportConfig";
  
  import bulkCreateEquipmentModels
    from "../import/bulkCreateEquipmentModels";
  
  export default function EquipmentModelPage() {
  
    const {
  
      records,
  
      create,
  
      update,
  
      softDelete,
  
      refresh,
  
    } = useEquipmentModels();
  
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
      useState<EquipmentModelRecord | null>(
        null,
      );
  
    const filtered =
      useMemo(
  
        () =>
  
          records.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.equipmentModel
  
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
  
      record: EquipmentModelRecord,
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
  
      record: EquipmentModelRecord,
  
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
  
      bulkCreateEquipmentModels(
  
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
  
            "Equipment Models",
  
          sheetName:
  
            "Equipment Models",
  
          columns: {
  
            equipmentModel:
  
              "Equipment Model",
  
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
  
            "Equipment Models",
  
          columns: {
  
            equipmentModel:
  
              "Equipment Model",
  
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
  
              "Equipment Model",
  
            required: true,
  
            sample:
  
              "CAT 320D",
  
            description:
  
              "Equipment Model",
  
          },
  
          {
  
            header:
  
              "Description",
  
            required: true,
  
            sample:
  
              "Hydraulic Excavator",
  
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
  
            "Equipment Model Template",
  
        },
  
      );
  
    }
    return (

        <>
    
          <MasterPageLayout
    
            title="Equipment Model Master"
    
            toolbar={
    
              <EquipmentModelToolbar
    
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
    
            table={
    
              <EquipmentModelTable
    
                records={filtered}
    
                onEdit={openEdit}
    
                onDelete={softDelete}
    
              />
    
            }
    
          />
    
          <MasterDrawer
    
            open={drawerOpen}
    
            title={
    
              editing
    
                ? "Edit Equipment Model"
    
                : "New Equipment Model"
    
            }
    
            onClose={() =>
    
              setDrawerOpen(false)
    
            }
    
          >
    
            <EquipmentModelForm
    
              editing={editing}
    
              onSave={save}
    
              onCancel={() =>
    
                setDrawerOpen(false)
    
              }
    
            />
    
          </MasterDrawer>
    
          <MasterImportWizard
    
            open={importOpen}
    
            title="Import Equipment Models"
    
            columns={
    
              equipmentModelImportConfig.columns
    
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