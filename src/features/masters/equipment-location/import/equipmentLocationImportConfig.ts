import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentLocationImportRecord {
  
    location: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentLocationImportColumns: ImportColumnDefinition<EquipmentLocationImportRecord>[] = [
  
    {
  
      field: "location",
  
      header: "Equipment Location",
  
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
  
  export const equipmentLocationHeaderMap = {
  
    "Equipment Location": "location",
  
    "Location": "location",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentLocationTemplateHeaders = [
  
    "Equipment Location",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentLocationTemplateExample: EquipmentLocationImportRecord = {
  
    location: "Main Warehouse",
  
    description: "Primary equipment storage area",
  
    active: true,
  
  };
  
  const equipmentLocationImportConfig = {
  
    columns: equipmentLocationImportColumns,
  
    headerMap: equipmentLocationHeaderMap,
  
    templateHeaders: equipmentLocationTemplateHeaders,
  
    templateExample: equipmentLocationTemplateExample,
  
  };
  
  export default equipmentLocationImportConfig;