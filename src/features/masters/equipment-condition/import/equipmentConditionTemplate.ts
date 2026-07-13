import equipmentConditionImportConfig, {
    type EquipmentConditionImportRecord,
  } from "./equipmentConditionImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentConditionTemplateHeaders(): string[] {
  
    return equipmentConditionImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentConditionTemplateExample(): EquipmentConditionImportRecord {
  
    return {
  
      ...equipmentConditionImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentConditionImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentConditionExcelTemplate: TemplateColumn[] =
  
    equipmentConditionImportConfig.columns.map(
  
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
  
  export const equipmentConditionCsvTemplate =
  
    equipmentConditionExcelTemplate;
  
  export default {
  
    excel: equipmentConditionExcelTemplate,
  
    csv: equipmentConditionCsvTemplate,
  
    headers: getEquipmentConditionTemplateHeaders,
  
    example: getEquipmentConditionTemplateExample,
  
  };