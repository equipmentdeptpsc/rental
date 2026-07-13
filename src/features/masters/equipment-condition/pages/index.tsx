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
  
  import EquipmentConditionToolbar
    from "../components/EquipmentConditionToolbar";
  
  import EquipmentConditionTable
    from "../components/EquipmentConditionTable";
  
  import EquipmentConditionForm
    from "../components/EquipmentConditionForm";
  
  import {
    useEquipmentConditions,
  } from "../context";
  
  import type {
    EquipmentConditionRecord,
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
  
  import equipmentConditionImportConfig
    from "../import/equipmentConditionImportConfig";
  
  import bulkCreateEquipmentConditions
    from "../import/bulkCreateEquipmentConditions";
  
  export default function EquipmentConditionPage() {
  
    const {
      records,
      create,
      update,
      remove,
      refresh,
    } = useEquipmentConditions();
  
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
      useState<EquipmentConditionRecord | null>(
        null,
      );
  
    const filtered =
      useMemo(
  
        () =>
  
          records.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.condition
  
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
  
      record: EquipmentConditionRecord,
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
  
      record: EquipmentConditionRecord,
  
    ) {
  
      if (editing) {
  
        update(record);
  
      } else {
  
        create(record);
  
      }
  
      setDrawerOpen(false);
  
    }
  
    function handleImport(
  
      imported: any[],
  
    ) {
  
      bulkCreateEquipmentConditions(
  
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
            "Equipment Conditions",
  
          sheetName:
            "Equipment Conditions",
  
          columns: {
  
            condition:
              "Equipment Condition",
  
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
            "Equipment Conditions",
  
          columns: {
  
            condition:
              "Equipment Condition",
  
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
              "Equipment Condition",
  
            required: true,
  
            sample:
              "Good",
  
            description:
              "Equipment Condition",
  
          },
  
          {
  
            header:
              "Description",
  
            required: true,
  
            sample:
              "Equipment is in good operating condition",
  
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
            "Equipment Condition Template",
  
        },
  
      );
  
    }
    return (

        <>
    
          <MasterPageLayout
    
            title="Equipment Condition Master"
    
            toolbar={
    
              <EquipmentConditionToolbar
    
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
    
              <EquipmentConditionTable
    
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
    
                ? "Edit Equipment Condition"
    
                : "New Equipment Condition"
    
            }
    
            onClose={() =>
    
              setDrawerOpen(false)
    
            }
    
          >
    
            <EquipmentConditionForm
    
              editing={editing}
    
              onSave={save}
    
              onCancel={() =>
    
                setDrawerOpen(false)
    
              }
    
            />
    
          </MasterDrawer>
    
          <MasterImportWizard
    
            open={importOpen}
    
            title="Import Equipment Conditions"
    
            columns={
    
              equipmentConditionImportConfig.columns
    
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