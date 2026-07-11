export interface ActivityCodeImportRecord {
    activityCode: string;
    description: string;
    active?: boolean;
  }
  
  export const activityCodeImportColumns = [
    {
      key: "activityCode",
      label: "Activity Code",
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
  
  export const activityCodeHeaderMap = {
    "Activity Code": "activityCode",
    Description: "description",
    Active: "active",
  };
  
  export const activityCodeTemplateHeaders = [
    "Activity Code",
    "Description",
    "Active",
  ];
  
  export const activityCodeTemplateExample: ActivityCodeImportRecord = {
    activityCode: "CSP",
    description: "CEBU SOUTH PORT",
    active: true,
  };
  
  const activityCodeImportConfig = {
    columns: activityCodeImportColumns,
    headerMap: activityCodeHeaderMap,
    templateHeaders: activityCodeTemplateHeaders,
    templateExample: activityCodeTemplateExample,
  };
  
  export default activityCodeImportConfig;