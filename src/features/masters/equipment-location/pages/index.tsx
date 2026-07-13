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
  
  import EquipmentLocationToolbar
    from "../components/EquipmentLocationToolbar";
  
  import EquipmentLocationTable
    from "../components/EquipmentLocationTable";
  
  import EquipmentLocationForm
    from "../components/EquipmentLocationForm";
  
  import {
    useEquipmentLocations,
  } from "../context";
  
  import type {
    EquipmentLocationRecord,
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
  
  import equipmentLocationImportConfig
    from "../import/equipmentLocationImportConfig";
  
  import bulkCreateEquipmentLocations
    from "../import/bulkCreateEquipmentLocations";
  
  export default function EquipmentLocationPage() {
  
    const {
      records,
      create,
      update,
      remove,
      refresh,
    } = useEquipmentLocations();
  
    const [keyword, setKeyword] = useState("");
  
    const [drawerOpen, setDrawerOpen] = useState(false);
  
    const [importOpen, setImportOpen] = useState(false);
  
    const [editing, setEditing] =
      useState<EquipmentLocationRecord | null>(null);
  
    const filtered = useMemo(
  
      () =>
  
        records.filter(
  
          (item) =>
  
            !item.deleted &&
  
            (
  
              item.location
  
                .toLowerCase()
  
                .includes(keyword.toLowerCase())
  
              ||
  
              item.description
  
                .toLowerCase()
  
                .includes(keyword.toLowerCase())
  
            )
  
        ),
  
      [records, keyword],
  
    );
  
    function openCreate() {
  
      setEditing(null);
  
      setDrawerOpen(true);
  
    }
  
    function openEdit(
      record: EquipmentLocationRecord,
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
      record: EquipmentLocationRecord,
    ) {
  
      if (editing) {
  
        update(record);
  
      } else {
  
        create(record);
  
      }
  
      setDrawerOpen(false);
  
    }
  
    function handleImport(imported: any[]) {
  
      bulkCreateEquipmentLocations(imported);
  
    }
  
    function handleImportCompleted() {
  
      refresh();
  
      setImportOpen(false);
  
    }
  
    function exportExcel() {
  
      exportToExcel(filtered, {
  
        fileName: "Equipment Locations",
  
        sheetName: "Equipment Locations",
  
        columns: {
  
          location: "Equipment Location",
  
          description: "Description",
  
          active: "Active",
  
        },
  
      });
  
    }
  
    function exportCsv() {
  
      exportToCsv(filtered, {
  
        fileName: "Equipment Locations",
  
        columns: {
  
          location: "Equipment Location",
  
          description: "Description",
  
          active: "Active",
  
        },
  
      });
  
    }
  
    function downloadTemplate() {
  
      generateTemplate(
  
        [
  
          {
  
            header: "Equipment Location",
  
            required: true,
  
            sample: "Main Warehouse",
  
            description: "Equipment Location",
  
          },
  
          {
  
            header: "Description",
  
            required: true,
  
            sample: "Primary equipment storage area",
  
            description: "Description",
  
          },
  
          {
  
            header: "Active",
  
            required: false,
  
            sample: true,
  
            description: "TRUE or FALSE",
  
          },
  
        ],
  
        {
  
          fileName:
  
            "Equipment Location Template",
  
        },
  
      );
  
    }
    return (

        <>
    
          <MasterPageLayout
    
            title="Equipment Location Master"
    
            toolbar={
    
              <EquipmentLocationToolbar
    
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
    
              <EquipmentLocationTable
    
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
    
                ? "Edit Equipment Location"
    
                : "New Equipment Location"
    
            }
    
            onClose={() =>
    
              setDrawerOpen(false)
    
            }
    
          >
    
            <EquipmentLocationForm
    
              editing={editing}
    
              onSave={save}
    
              onCancel={() =>
    
                setDrawerOpen(false)
    
              }
    
            />
    
          </MasterDrawer>
    
          <MasterImportWizard
    
            open={importOpen}
    
            title="Import Equipment Locations"
    
            columns={
    
              equipmentLocationImportConfig.columns
    
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