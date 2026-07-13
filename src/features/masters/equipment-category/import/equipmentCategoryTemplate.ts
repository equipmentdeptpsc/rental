import equipmentCategoryImportConfig, {
    type EquipmentCategoryImportRecord,
  } from "./equipmentCategoryImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentCategoryTemplateHeaders(): string[] {
  
    return equipmentCategoryImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentCategoryTemplateExample(): EquipmentCategoryImportRecord {
  
    return {
  
      ...equipmentCategoryImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentCategoryImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentCategoryExcelTemplate: TemplateColumn[] =
  
    equipmentCategoryImportConfig.columns.map(
  
      column => ({
  
        header: column.header,
  
        required: column.required ?? false,
  
        sample: example[String(column.field)] ?? "",
  
        description:
  
          column.required
  
            ? "Required"
  
            : "Optional",
  
      }),
  
    );
  
  export const equipmentCategoryCsvTemplate =
  
    equipmentCategoryExcelTemplate;
  
  export default {
  
    excel: equipmentCategoryExcelTemplate,
  
    csv: equipmentCategoryCsvTemplate,
  
    headers: getEquipmentCategoryTemplateHeaders,
  
    example: getEquipmentCategoryTemplateExample,
  
  };