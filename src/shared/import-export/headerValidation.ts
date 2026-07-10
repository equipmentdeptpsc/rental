/**
 * ==========================================================
 * Header Validation
 * ----------------------------------------------------------
 * Generic worksheet header validator used by every
 * Master Data import in the ERP.
 * ==========================================================
 */

export interface HeaderValidationOptions {

    /**
     * Required columns.
     */
  
    requiredHeaders: string[];
  
    /**
     * Allow columns not defined
     * in requiredHeaders.
     */
  
    allowAdditionalColumns?: boolean;
  
    /**
     * Require exact order.
     */
  
    strictColumnOrder?: boolean;
  
  }
  
  export interface HeaderValidationResult {
  
    valid: boolean;
  
    errors: string[];
  
  }
  
  export function validateHeaders(
  
    headers: string[],
  
    options: HeaderValidationOptions
  
  ): HeaderValidationResult {
  
    const errors: string[] = [];
  
    const normalizedHeaders =
      headers.map(normalize);
  
    const required =
      options.requiredHeaders.map(
        normalize
      );
  
    /**
     * Blank header detection
     */
  
    headers.forEach(
  
      (header, index) => {
  
        if (!header.trim()) {
  
          errors.push(
  
            `Column ${index + 1} has no header.`
  
          );
  
        }
  
      }
  
    );
  
    /**
     * Duplicate detection
     */
  
    const duplicates =
      normalizedHeaders.filter(
  
        (header, index) =>
  
          normalizedHeaders.indexOf(
            header
          ) !== index
  
      );
  
    duplicates.forEach(
  
      duplicate =>
  
        errors.push(
  
          `Duplicate column "${duplicate}" detected.`
  
        )
  
    );
  
    /**
     * Missing required columns
     */
  
    required.forEach(
  
      requiredHeader => {
  
        if (
  
          !normalizedHeaders.includes(
  
            requiredHeader
  
          )
  
        ) {
  
          errors.push(
  
            `Missing required column "${requiredHeader}".`
  
          );
  
        }
  
      }
  
    );
  
    /**
     * Unexpected columns
     */
  
    if (
  
      !options.allowAdditionalColumns
  
    ) {
  
      normalizedHeaders.forEach(
  
        header => {
  
          if (
  
            !required.includes(
  
              header
  
            )
  
          ) {
  
            errors.push(
  
              `Unexpected column "${header}".`
  
            );
  
          }
  
        }
  
      );
  
    }
  
    /**
     * Strict order validation
     */
  
    if (
  
      options.strictColumnOrder
  
    ) {
  
      required.forEach(
  
        (
  
          requiredHeader,
  
          index
  
        ) => {
  
          if (
  
            normalizedHeaders[index] !==
  
            requiredHeader
  
          ) {
  
            errors.push(
  
              `Expected column ${index + 1} to be "${options.requiredHeaders[index]}".`
  
            );
  
          }
  
        }
  
      );
  
    }
  
    return {
  
      valid:
  
        errors.length === 0,
  
      errors,
  
    };
  
  }
  
  /**
   * ==========================================================
   * Utility
   * ==========================================================
   */
  
  function normalize(
  
    value: string
  
  ): string {
  
    return value
  
      .trim()
  
      .toLowerCase();
  
  }