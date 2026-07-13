import equipmentBrandImportConfig, {
    type EquipmentBrandImportRecord,
  } from "./equipmentBrandImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentBrandTemplateHeaders(): string[] {
  
    return equipmentBrandImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentBrandTemplateExample(): EquipmentBrandImportRecord {
  
    return {
  
      ...equipmentBrandImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentBrandImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentBrandExcelTemplate: TemplateColumn[] =
  
    equipmentBrandImportConfig.columns.map(
  
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
  
  export const equipmentBrandCsvTemplate =
  
    equipmentBrandExcelTemplate;
  
  export default {
  
    excel: equipmentBrandExcelTemplate,
  
    csv: equipmentBrandCsvTemplate,
  
    headers: getEquipmentBrandTemplateHeaders,
  
    example: getEquipmentBrandTemplateExample,
  
  };