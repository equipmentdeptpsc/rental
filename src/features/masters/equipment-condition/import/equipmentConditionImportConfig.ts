import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentConditionImportRecord {
  
    condition: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentConditionImportColumns: ImportColumnDefinition<EquipmentConditionImportRecord>[] = [
  
    {
  
      field: "condition",
  
      header: "Equipment Condition",
  
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
  
  export const equipmentConditionHeaderMap = {
  
    "Equipment Condition": "condition",
  
    "Condition": "condition",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentConditionTemplateHeaders = [
  
    "Equipment Condition",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentConditionTemplateExample: EquipmentConditionImportRecord = {
  
    condition: "Good",
  
    description: "Equipment is in good operating condition",
  
    active: true,
  
  };
  
  const equipmentConditionImportConfig = {
  
    columns: equipmentConditionImportColumns,
  
    headerMap: equipmentConditionHeaderMap,
  
    templateHeaders: equipmentConditionTemplateHeaders,
  
    templateExample: equipmentConditionTemplateExample,
  
  };
  
  export default equipmentConditionImportConfig;