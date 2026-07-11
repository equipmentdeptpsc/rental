export interface CostCodeImportRecord {
    costCode: string;
    description: string;
    active?: boolean;
  }
  
  export const costCodeImportColumns = [
    {
      key: "costCode",
      label: "Cost Code",
      required: true,
    },
    {
      key: "description",
      label: "Description",
      required: true,
    },
    {
      key: "active",
      label: "Active",
      required: false,
    },
  ];
  
  export const costCodeHeaderMap = {
    "Cost Code": "costCode",
    Description: "description",
    Active: "active",
  };
  
  export const costCodeTemplateHeaders = [
    "Cost Code",
    "Description",
    "Active",
  ];
  
  export const costCodeTemplateExample: CostCodeImportRecord = {
    costCode: "1000",
    description: "GENERAL ADMINISTRATION",
    active: true,
  };
  
  const costCodeImportConfig = {
    columns: costCodeImportColumns,
    headerMap: costCodeHeaderMap,
    templateHeaders: costCodeTemplateHeaders,
    templateExample: costCodeTemplateExample,
  };
  
  export default costCodeImportConfig;