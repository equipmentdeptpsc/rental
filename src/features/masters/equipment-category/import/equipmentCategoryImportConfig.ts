import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentCategoryImportRecord {
  
    category: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentCategoryImportColumns: ImportColumnDefinition<EquipmentCategoryImportRecord>[] = [
  
    {
  
      field: "category",
  
      header: "Equipment Category",
  
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
  
  export const equipmentCategoryHeaderMap = {
  
    "Equipment Category": "category",
  
    "Category": "category",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentCategoryTemplateHeaders = [
  
    "Equipment Category",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentCategoryTemplateExample: EquipmentCategoryImportRecord = {
  
    category: "Earth Moving",
  
    description: "Heavy earth moving equipment",
  
    active: true,
  
  };
  
  const equipmentCategoryImportConfig = {
  
    columns: equipmentCategoryImportColumns,
  
    headerMap: equipmentCategoryHeaderMap,
  
    templateHeaders: equipmentCategoryTemplateHeaders,
  
    templateExample: equipmentCategoryTemplateExample,
  
  };
  
  export default equipmentCategoryImportConfig;