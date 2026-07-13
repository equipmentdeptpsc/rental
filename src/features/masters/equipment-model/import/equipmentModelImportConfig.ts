import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentModelImportRecord {
  
    equipmentModel: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentModelImportColumns: ImportColumnDefinition<EquipmentModelImportRecord>[] = [
  
    {
  
      field: "equipmentModel",
  
      header: "Equipment Model",
  
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
  
  export const equipmentModelHeaderMap = {
  
    "Equipment Model": "equipmentModel",
  
    "Model": "equipmentModel",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentModelTemplateHeaders = [
  
    "Equipment Model",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentModelTemplateExample: EquipmentModelImportRecord = {
  
    equipmentModel: "CAT 320D",
  
    description: "Hydraulic Excavator",
  
    active: true,
  
  };
  
  const equipmentModelImportConfig = {
  
    columns: equipmentModelImportColumns,
  
    headerMap: equipmentModelHeaderMap,
  
    templateHeaders: equipmentModelTemplateHeaders,
  
    templateExample: equipmentModelTemplateExample,
  
  };
  
  export default equipmentModelImportConfig;