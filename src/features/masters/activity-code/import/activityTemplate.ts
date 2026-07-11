import activityImportConfig, {
    type ActivityCodeImportRecord,
  } from "./activityImportConfig";
  
  /**
   * ==========================================
   * Activity Code Import Template
   * ==========================================
   *
   * This module provides reusable metadata for:
   *
   * • Excel Template
   * • CSV Template
   * • Future MasterImportWizard integration
   *
   * The column definitions remain the
   * single source of truth via
   * activityImportConfig.ts.
   */
  
  /**
   * Returns the template headers
   * in the correct export order.
   */
  export function getActivityTemplateHeaders(): string[] {
  
    return [
      ...activityImportConfig.templateHeaders,
    ];
  
  }
  
  /**
   * Returns one example row used
   * when generating template files.
   */
  export function getActivityTemplateExample(): ActivityCodeImportRecord {
  
    return {
  
      ...activityImportConfig.templateExample,
  
    };
  
  }
  
  /**
   * Returns template rows.
   *
   * Keeping this as an array allows
   * future support for multiple sample
   * rows without changing consumers.
   */
  export function getActivityTemplateRows(): ActivityCodeImportRecord[] {
  
    return [
  
      getActivityTemplateExample(),
  
    ];
  
  }
  
  /**
   * Returns metadata consumed by the
   * shared Import / Export framework.
   */
  export function getActivityTemplateMetadata() {
  
    return {
  
      fileName: "ActivityCodeTemplate",
  
      worksheetName: "Activity Codes",
  
      headers: getActivityTemplateHeaders(),
  
      rows: getActivityTemplateRows(),
  
    };
  
  }
  
  /**
   * Default export.
   */
  const activityTemplate = {
  
    getActivityTemplateHeaders,
  
    getActivityTemplateExample,
  
    getActivityTemplateRows,
  
    getActivityTemplateMetadata,
  
  };
  
  export default activityTemplate;