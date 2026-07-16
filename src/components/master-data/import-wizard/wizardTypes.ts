import type { ReactNode } from "react";

/**
 * ==========================================
 * Wizard Steps
 * ==========================================
 */

export enum ImportWizardStep {

  SelectFile = 0,

  ValidateFile = 1,

  ValidateHeaders = 2,

  ValidateRecords = 3,

  Preview = 4,

  Summary = 5,

}

/**
 * ==========================================
 * File Information
 * ==========================================
 */

export interface ImportFileInfo {

  file: File;

  fileName: string;

  extension: string;

  size: number;

}

/**
 * ==========================================
 * Generic Validation Result
 * ==========================================
 */

export interface ImportValidationResult {

  valid: boolean;

  errors: string[];

  warnings: string[];

}

/**
 * ==========================================
 * Header Validation
 * ==========================================
 */

export interface HeaderValidationResult
  extends ImportValidationResult {

  detectedHeaders: string[];

  missingHeaders: string[];

  extraHeaders: string[];

}

/**
 * ==========================================
 * Record Validation
 * ==========================================
 */

export interface RecordValidationError {

  row: number;

  column?: string;

  message: string;

}

export interface RecordValidationWarning {

  row: number;

  column?: string;

  message: string;

}

export interface RecordValidationResult<T> {

  validRecords: T[];

  invalidRecords: T[];

  errors: RecordValidationError[];

  warnings: RecordValidationWarning[];

}

/**
 * ==========================================
 * Duplicate Detection
 * ==========================================
 */

export interface DuplicateRecord<T> {

  imported: T;

  existing: T;

  key: string;

}

/**
 * ==========================================
 * Import Summary
 * ==========================================
 */

export interface ImportSummary {

  totalRows: number;

  importedRows: number;

  skippedRows: number;

  duplicateRows: number;

  invalidRows: number;

}

/**
 * ==========================================
 * Preview Row
 * ==========================================
 */

export interface ImportPreviewRow<T> {

  index: number;

  data: T;

  hasError: boolean;

  hasWarning: boolean;

}

/**
 * ==========================================
 * Column Definition
 * ==========================================
 */

export interface ImportColumnDefinition<T> {

  field: keyof T;

  header: string;

  required?: boolean;

}

/**
 * ==========================================
 * Wizard Configuration
 * ==========================================
 */

export interface MasterImportWizardProps<T> {

  /**
   * Dialog title
   */

  title: string;

  /**
   * Dialog visibility
   */

  open: boolean;

  /**
   * Column definitions
   */

  columns: ImportColumnDefinition<T>[];

  /**
   * Called after Finish Import.
   */

  onImport(
    records: T[]
  ): void;

  /**
   * NEW (Sprint 5.6B)
   *
   * Optional callback fired after the import
   * has completed successfully.
   *
   * Backward compatible.
   */

  onCompleted?(
    summary: ImportSummary
  ): void;

  /**
   * Cancel wizard
   */

  onClose(): void;

  /**
   * Validate one record
   */

  validateRecord?(
    record: T,
    rowNumber: number
  ): string[];

}

/**
 * ==========================================
 * Wizard State
 * ==========================================
 */

export interface ImportWizardState<T> {

  step: ImportWizardStep;

  file?: ImportFileInfo;

  rawRecords: T[];

  previewRows: ImportPreviewRow<T>[];

  validation?: RecordValidationResult<T>;

  blockingErrors?: string[];

  isEmptyResult?: boolean;

  summary?: ImportSummary;

}

/**
 * ==========================================
 * Wizard Step Component
 * ==========================================
 */

export interface WizardStepProps<T> {

  state: ImportWizardState<T>;

  setState(
    state: ImportWizardState<T>
  ): void;

  config: MasterImportWizardProps<T>;

}

/**
 * ==========================================
 * Footer Actions
 * ==========================================
 */

export interface WizardFooterAction {

  label: string;

  onClick(): void;

  disabled?: boolean;

  variant?:
    | "primary"
    | "secondary"
    | "danger";

}

/**
 * ==========================================
 * Step Metadata
 * ==========================================
 */

export interface WizardStepDefinition {

  step: ImportWizardStep;

  title: string;

  description: string;

  icon?: ReactNode;

}
