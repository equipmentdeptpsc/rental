import equipmentOwnershipImportConfig, {
    type EquipmentOwnershipImportRecord,
  } from "./equipmentOwnershipImportConfig";
  
  export interface TemplateColumn {
  
    header: string;
  
    required: boolean;
  
    sample: string | boolean;
  
    description?: string;
  
  }
  
  export function getEquipmentOwnershipTemplateHeaders(): string[] {
  
    return equipmentOwnershipImportConfig.columns.map(
  
      column => column.header,
  
    );
  
  }
  
  export function getEquipmentOwnershipTemplateExample(): EquipmentOwnershipImportRecord {
  
    return {
  
      ...equipmentOwnershipImportConfig.templateExample,
  
    };
  
  }
  
  const example =
  
    equipmentOwnershipImportConfig.templateExample as unknown as Record<
      string,
      string | boolean
    >;
  
  export const equipmentOwnershipExcelTemplate: TemplateColumn[] =
  
    equipmentOwnershipImportConfig.columns.map(
  
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
  
  export const equipmentOwnershipCsvTemplate =
  
    equipmentOwnershipExcelTemplate;
  
  export default {
  
    excel: equipmentOwnershipExcelTemplate,
  
    csv: equipmentOwnershipCsvTemplate,
  
    headers: getEquipmentOwnershipTemplateHeaders,
  
    example: getEquipmentOwnershipTemplateExample,
  
  };