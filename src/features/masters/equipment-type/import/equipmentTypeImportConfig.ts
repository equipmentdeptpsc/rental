export interface EquipmentTypeImportRecord {
    equipmentType: string;
    description: string;
    active?: boolean;
  }
  
  export const equipmentTypeImportColumns = [
    {
      field: "equipmentType",
      header: "Equipment Type",
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
  
  export const equipmentTypeHeaderMap = {
    "Equipment Type": "equipmentType",
    "Description": "description",
    "Active": "active",
  };
  
  export const equipmentTypeTemplateHeaders = [
    "Equipment Type",
    "Description",
    "Active",
  ];
  
  export const equipmentTypeTemplateExample: EquipmentTypeImportRecord = {
    equipmentType: "EXCAVATOR",
    description: "Hydraulic Excavator",
    active: true,
  };
  
  const equipmentTypeImportConfig = {
    columns: equipmentTypeImportColumns,
    headerMap: equipmentTypeHeaderMap,
    templateHeaders: equipmentTypeTemplateHeaders,
    templateExample: equipmentTypeTemplateExample,
  };
  
  export default equipmentTypeImportConfig;