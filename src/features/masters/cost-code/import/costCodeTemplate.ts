import costCodeImportConfig, {
    type CostCodeImportRecord,
  } from "./costCodeImportConfig";
  
  /**
   * ==========================================
   * Cost Code Template Headers
   * ==========================================
   */
  
  export function getCostCodeTemplateHeaders(): string[] {
    return [...costCodeImportConfig.templateHeaders];
  }
  
  /**
   * ==========================================
   * Cost Code Template Example
   * ==========================================
   */
  
  export function getCostCodeTemplateExample(): CostCodeImportRecord {
    return {
      ...costCodeImportConfig.templateExample,
    };
  }
  
  /**
   * ==========================================
   * Excel Template Metadata
   * ==========================================
   */
  
  export const costCodeExcelTemplate = {
    fileName: "Cost Code Template",
    sheetName: "Cost Codes",
    headers: getCostCodeTemplateHeaders(),
    example: getCostCodeTemplateExample(),
  };
  
  /**
   * ==========================================
   * CSV Template Metadata
   * ==========================================
   */
  
  export const costCodeCsvTemplate = {
    fileName: "Cost Code Template",
    headers: getCostCodeTemplateHeaders(),
    example: getCostCodeTemplateExample(),
  };
  
  export default {
    headers: getCostCodeTemplateHeaders,
    example: getCostCodeTemplateExample,
    excel: costCodeExcelTemplate,
    csv: costCodeCsvTemplate,
  };