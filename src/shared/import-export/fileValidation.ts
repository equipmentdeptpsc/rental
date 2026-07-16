/**
 * ==========================================================
 * Master Data Import Validation
 * ----------------------------------------------------------
 * Shared validation used BEFORE parsing Excel or CSV files.
 * This module is ERP-wide and reusable by every importer.
 * ==========================================================
 */

export const DEFAULT_MAX_FILE_SIZE =
  5 * 1024 * 1024; // 5 MB

/**
 * Maximum rows is currently a placeholder.
 * The actual row count validation will be
 * performed after Excel/CSV parsing.
 */
export const DEFAULT_MAX_ROWS = 5000;

export const DEFAULT_ALLOWED_EXTENSIONS = [

  ".xlsx",

  ".csv",

];

export const DEFAULT_ALLOWED_MIME_TYPES = [

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "text/csv",

  "application/csv",

  "text/plain",

];

export interface FileValidationOptions {

  allowedExtensions?: string[];

  allowedMimeTypes?: string[];

  maxFileSize?: number;

  maxRows?: number;

}

export interface FileValidationResult {

  valid: boolean;

  errors: string[];

}

export function validateImportFile(

  file: File,

  options: FileValidationOptions = {}

): FileValidationResult {

  const errors: string[] = [];

  const {

    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,

    allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES,

    maxFileSize = DEFAULT_MAX_FILE_SIZE,

  } = options;

  /**
   * File selected?
   */

  if (!file) {

    errors.push(

      "No file selected."

    );

    return {

      valid: false,

      errors,

    };

  }

  /**
   * Empty filename
   */

  if (!file.name.trim()) {

    errors.push(

      "Invalid filename."

    );

  }

  /**
   * Empty file
   */

  if (file.size === 0) {

    errors.push(

      "The selected file is empty."

    );

  }

  /**
   * File size
   */

  if (file.size > maxFileSize) {

    errors.push(

      `File exceeds the maximum allowed size of ${formatBytes(maxFileSize)}.`

    );

  }

  /**
   * Extension validation
   */

  const lowerName =
    file.name.toLowerCase();

  const validExtension =
    allowedExtensions.some(

      extension =>

        lowerName.endsWith(

          extension.toLowerCase()

        )

    );

  if (!validExtension) {

    errors.push(

      `Unsupported file type. Allowed formats: ${allowedExtensions.join(", ")}.`

    );

  }

  if (
    file.type &&
    !allowedMimeTypes.includes(file.type.toLowerCase())
  ) {

    errors.push(

      "Unsupported file content type."

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
 * Placeholder
 * ----------------------------------------------------------
 * Actual row count validation happens AFTER
 * Excel/CSV parsing.
 * ==========================================================
 */

export function validateRowCount(

  rowCount: number,

  maxRows: number = DEFAULT_MAX_ROWS

): FileValidationResult {

  if (rowCount <= maxRows) {

    return {

      valid: true,

      errors: [],

    };

  }

  return {

    valid: false,

    errors: [

      `The file contains ${rowCount.toLocaleString()} rows. Maximum supported rows: ${maxRows.toLocaleString()}.`

    ],

  };

}

/**
 * ==========================================================
 * Utility
 * ==========================================================
 */

export function formatBytes(

  bytes: number

): string {

  if (bytes < 1024) {

    return `${bytes} B`;

  }

  if (bytes < 1024 * 1024) {

    return `${(bytes / 1024).toFixed(1)} KB`;

  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

}
