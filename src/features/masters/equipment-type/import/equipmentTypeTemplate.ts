import equipmentTypeImportConfig, {
  type EquipmentTypeImportRecord,
} from "./equipmentTypeImportConfig";

export interface TemplateColumn {

  header: string;

  required: boolean;

  sample: string | boolean;

  description?: string;

}

export function getEquipmentTypeTemplateHeaders(): string[] {

  return equipmentTypeImportConfig.columns.map(

    column => column.header,

  );

}

export function getEquipmentTypeTemplateExample(): EquipmentTypeImportRecord {

  return {

    ...equipmentTypeImportConfig.templateExample,

  };

}

const example =

  equipmentTypeImportConfig.templateExample as unknown as Record<
    string,
    string | boolean
  >;

export const equipmentTypeExcelTemplate: TemplateColumn[] =

  equipmentTypeImportConfig.columns.map(

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

export const equipmentTypeCsvTemplate =

  equipmentTypeExcelTemplate;

export default {

  excel: equipmentTypeExcelTemplate,

  csv: equipmentTypeCsvTemplate,

  headers: getEquipmentTypeTemplateHeaders,

  example: getEquipmentTypeTemplateExample,

};