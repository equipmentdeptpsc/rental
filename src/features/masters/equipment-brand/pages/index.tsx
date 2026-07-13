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
  
  import EquipmentBrandToolbar
    from "../components/EquipmentBrandToolbar";
  
  import EquipmentBrandTable
    from "../components/EquipmentBrandTable";
  
  import EquipmentBrandForm
    from "../components/EquipmentBrandForm";
  
  import {
    useEquipmentBrands,
  } from "../context";
  
  import type {
    EquipmentBrandRecord,
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
  
  import equipmentBrandImportConfig
    from "../import/equipmentBrandImportConfig";
  
  import bulkCreateEquipmentBrands
    from "../import/bulkCreateEquipmentBrands";
  
  export default function EquipmentBrandPage() {
  
    const {
      records,
      create,
      update,
      remove,
      refresh,
    } = useEquipmentBrands();
  
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
      useState<EquipmentBrandRecord | null>(
        null,
      );
  
    const filtered =
      useMemo(
  
        () =>
  
          records.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.brand
  
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
  
      record: EquipmentBrandRecord,
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
  
      record: EquipmentBrandRecord,
  
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
  
      bulkCreateEquipmentBrands(
  
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
  
            "Equipment Brands",
  
          sheetName:
  
            "Equipment Brands",
  
          columns: {
  
            brand:
  
              "Equipment Brand",
  
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
  
            "Equipment Brands",
  
          columns: {
  
            brand:
  
              "Equipment Brand",
  
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
  
              "Equipment Brand",
  
            required: true,
  
            sample:
  
              "CATERPILLAR",
  
            description:
  
              "Equipment Brand",
  
          },
  
          {
  
            header:
  
              "Description",
  
            required: true,
  
            sample:
  
              "CAT Heavy Equipment",
  
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
  
            "Equipment Brand Template",
  
        },
  
      );
  
    }
    return (

        <>
    
          <MasterPageLayout
    
            title="Equipment Brand Master"
    
            toolbar={
    
              <EquipmentBrandToolbar
    
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
    
              <EquipmentBrandTable
    
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
    
                ? "Edit Equipment Brand"
    
                : "New Equipment Brand"
    
            }
    
            onClose={() =>
    
              setDrawerOpen(false)
    
            }
    
          >
    
            <EquipmentBrandForm
    
              editing={editing}
    
              onSave={save}
    
              onCancel={() =>
    
                setDrawerOpen(false)
    
              }
    
            />
    
          </MasterDrawer>
    
          <MasterImportWizard
    
            open={importOpen}
    
            title="Import Equipment Brands"
    
            columns={
    
              equipmentBrandImportConfig.columns
    
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