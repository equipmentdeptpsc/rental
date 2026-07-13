import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentBrandImportRecord {
  
    brand: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentBrandImportColumns: ImportColumnDefinition<EquipmentBrandImportRecord>[] = [
  
    {
  
      field: "brand",
  
      header: "Equipment Brand",
  
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
  
  export const equipmentBrandHeaderMap = {
  
    "Equipment Brand": "brand",
  
    "Brand": "brand",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentBrandTemplateHeaders = [
  
    "Equipment Brand",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentBrandTemplateExample: EquipmentBrandImportRecord = {
  
    brand: "CATERPILLAR",
  
    description: "CAT Heavy Equipment",
  
    active: true,
  
  };
  
  const equipmentBrandImportConfig = {
  
    columns: equipmentBrandImportColumns,
  
    headerMap: equipmentBrandHeaderMap,
  
    templateHeaders: equipmentBrandTemplateHeaders,
  
    templateExample: equipmentBrandTemplateExample,
  
  };
  
  export default equipmentBrandImportConfig;