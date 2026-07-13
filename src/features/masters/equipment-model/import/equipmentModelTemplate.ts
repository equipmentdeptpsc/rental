import equipmentModelImportConfig, {
    type EquipmentModelImportRecord,
  } from "./equipmentModelImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentModelTemplateHeaders(): string[] {
  
    return equipmentModelImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentModelTemplateExample(): EquipmentModelImportRecord {
  
    return {
  
      ...equipmentModelImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentModelImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentModelExcelTemplate: TemplateColumn[] =
  
    equipmentModelImportConfig.columns.map(
  
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
  
  export const equipmentModelCsvTemplate =
  
    equipmentModelExcelTemplate;
  
  export default {
  
    excel: equipmentModelExcelTemplate,
  
    csv: equipmentModelCsvTemplate,
  
    headers: getEquipmentModelTemplateHeaders,
  
    example: getEquipmentModelTemplateExample,
  
  };