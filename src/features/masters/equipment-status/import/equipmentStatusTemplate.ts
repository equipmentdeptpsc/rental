import equipmentStatusImportConfig, {
    type EquipmentStatusImportRecord,
  } from "./equipmentStatusImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentStatusTemplateHeaders(): string[] {
  
    return equipmentStatusImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentStatusTemplateExample(): EquipmentStatusImportRecord {
  
    return {
  
      ...equipmentStatusImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentStatusImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentStatusExcelTemplate: TemplateColumn[] =
  
    equipmentStatusImportConfig.columns.map(
  
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
  
  export const equipmentStatusCsvTemplate =
  
    equipmentStatusExcelTemplate;
  
  export default {
  
    excel: equipmentStatusExcelTemplate,
  
    csv: equipmentStatusCsvTemplate,
  
    headers: getEquipmentStatusTemplateHeaders,
  
    example: getEquipmentStatusTemplateExample,
  
  };