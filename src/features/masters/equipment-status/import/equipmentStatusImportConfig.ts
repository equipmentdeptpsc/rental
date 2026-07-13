import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentStatusImportRecord {
  
    status: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentStatusImportColumns: ImportColumnDefinition<EquipmentStatusImportRecord>[] = [
  
    {
  
      field: "status",
  
      header: "Equipment Status",
  
      required: true,
  
    },
  
    {
  
      field: "description",
  
      header: "Description",
  
      required: true,
  
    },
  
    {
  
      field: "active",
  
      header: "Active",
  
      required: false,
  
    },
  
  ];
  
  export const equipmentStatusHeaderMap = {
  
    "Equipment Status": "status",
  
    "Status": "status",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentStatusTemplateHeaders = [
  
    "Equipment Status",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentStatusTemplateExample: EquipmentStatusImportRecord = {
  
    status: "Available",
  
    description: "Equipment is available for rental",
  
    active: true,
  
  };
  
  const equipmentStatusImportConfig = {
  
    columns: equipmentStatusImportColumns,
  
    headerMap: equipmentStatusHeaderMap,
  
    templateHeaders: equipmentStatusTemplateHeaders,
  
    templateExample: equipmentStatusTemplateExample,
  
  };
  
  export default equipmentStatusImportConfig;