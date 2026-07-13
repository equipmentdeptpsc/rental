import type {
    ImportColumnDefinition,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  export interface EquipmentOwnershipImportRecord {
  
    ownership: string;
  
    description: string;
  
    active?: boolean;
  
  }
  
  export const equipmentOwnershipImportColumns: ImportColumnDefinition<EquipmentOwnershipImportRecord>[] = [
  
    {
  
      field: "ownership",
  
      header: "Equipment Ownership",
  
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
  
  export const equipmentOwnershipHeaderMap = {
  
    "Equipment Ownership": "ownership",
  
    "Ownership": "ownership",
  
    "Description": "description",
  
    "Active": "active",
  
  };
  
  export const equipmentOwnershipTemplateHeaders = [
  
    "Equipment Ownership",
  
    "Description",
  
    "Active",
  
  ];
  
  export const equipmentOwnershipTemplateExample: EquipmentOwnershipImportRecord = {
  
    ownership: "Company Owned",
  
    description: "Owned by the company",
  
    active: true,
  
  };
  
  const equipmentOwnershipImportConfig = {
  
    columns: equipmentOwnershipImportColumns,
  
    headerMap: equipmentOwnershipHeaderMap,
  
    templateHeaders: equipmentOwnershipTemplateHeaders,
  
    templateExample: equipmentOwnershipTemplateExample,
  
  };
  
  export default equipmentOwnershipImportConfig;