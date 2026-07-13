import equipmentLocationImportConfig, {
    type EquipmentLocationImportRecord,
  } from "./equipmentLocationImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentLocationTemplateHeaders(): string[] {
  
    return equipmentLocationImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentLocationTemplateExample(): EquipmentLocationImportRecord {
  
    return {
  
      ...equipmentLocationImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentLocationImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentLocationExcelTemplate: TemplateColumn[] =
  
    equipmentLocationImportConfig.columns.map(
  
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
  
  export const equipmentLocationCsvTemplate =
    equipmentLocationExcelTemplate;
  
  export default {
  
    excel: equipmentLocationExcelTemplate,
  
    csv: equipmentLocationCsvTemplate,
  
    headers: getEquipmentLocationTemplateHeaders,
  
    example: getEquipmentLocationTemplateExample,
  
  };