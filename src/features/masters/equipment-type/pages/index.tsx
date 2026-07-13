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
  
  import EquipmentTypeToolbar
    from "../components/EquipmentTypeToolbar";
  
  import EquipmentTypeTable
    from "../components/EquipmentTypeTable";
  
  import EquipmentTypeForm
    from "../components/EquipmentTypeForm";
  
  import {
    useEquipmentTypes,
  } from "../context";
  
  import type {
    EquipmentTypeRecord,
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
  
  import equipmentTypeImportConfig
    from "../import/equipmentTypeImportConfig";
   
  import bulkCreateEquipmentTypes
    from "../import/bulkCreateEquipmentTypes";
  
  export default function EquipmentTypePage() {
  
    const {
  
      records,
  
      create,
  
      update,
  
      softDelete,
  
      refresh,
  
    } = useEquipmentTypes();
  
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
      useState<EquipmentTypeRecord | null>(
        null,
      );
  
    const filtered =
      useMemo(
  
        () =>
  
          records.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.equipmentType
  
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
  
      record: EquipmentTypeRecord,
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
  
      record: EquipmentTypeRecord,
  
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
  
      bulkCreateEquipmentTypes(
  
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
  
            "Equipment Types",
  
          sheetName:
  
            "Equipment Types",
  
          columns: {
  
            equipmentType:
  
              "Equipment Type",
  
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
  
            "Equipment Types",
  
          columns: {
  
            equipmentType:
  
              "Equipment Type",
  
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
  
              "Equipment Type",
  
            required: true,
  
            sample:
  
              "Excavator",
  
            description:
  
              "Equipment type",
  
          },
  
          {
  
            header:
  
              "Description",
  
            required: true,
  
            sample:
  
              "Crawler Excavator",
  
            description:
  
              "Equipment description",
  
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
  
            "Equipment Type Template",
  
        },
  
      );
  
    }
    return (

        <>
    
          <MasterPageLayout
    
            title="Equipment Type Master"
    
            toolbar={
    
              <EquipmentTypeToolbar
    
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
    
              <EquipmentTypeTable
    
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
    
                ? "Edit Equipment Type"
    
                : "New Equipment Type"
    
            }
    
            onClose={() =>
    
              setDrawerOpen(false)
    
            }
    
          >
    
            <EquipmentTypeForm
    
              editing={editing}
    
              onSave={save}
    
              onCancel={() =>
    
                setDrawerOpen(false)
    
              }
    
            />
    
    </MasterDrawer>

<MasterImportWizard
  open={importOpen}
  title="Import Equipment Types"
  columns={equipmentTypeImportConfig.columns}
  onImport={handleImport}
  onCompleted={handleImportCompleted}
  onClose={() => setImportOpen(false)}
/>

</>

);

}