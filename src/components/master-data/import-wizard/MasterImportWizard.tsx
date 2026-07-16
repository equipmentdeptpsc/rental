import {
  importExcel,
} from "@/shared/import-export/excelImport";
import { validateImportedData } from "@/shared/import-export/importValidation";

import {
  useMemo,
  useState,
} from "react";

import MasterDrawer from "../MasterDrawer";

import ImportWizardStepper from "./ImportWizardStepper";
import ImportWizardFileStep from "./ImportWizardFileStep";
import ImportWizardValidationStep from "./ImportWizardValidationStep";
import ImportWizardPreviewStep from "./ImportWizardPreviewStep";
import ImportWizardSummaryStep from "./ImportWizardSummaryStep";

import {
  ImportWizardStep,
  type ImportSummary,
  type ImportWizardState,
  type MasterImportWizardProps,
  type WizardStepDefinition,
} from "./wizardTypes";

export default function MasterImportWizard<
  T extends object,
>({
  open,
  title,
  columns,
  validateRecord,
  onImport,
  onCompleted,
  onClose,
}: MasterImportWizardProps<T>) {

  const [

    state,

    setState,

  ] = useState<ImportWizardState<T>>({

    step: ImportWizardStep.SelectFile,

    rawRecords: [],

    previewRows: [],

  });

  const steps =
    useMemo<WizardStepDefinition[]>(

      () => [

        {

          step:
            ImportWizardStep.SelectFile,

          title:
            "Select File",

          description:
            "Choose Excel or CSV",

        },

        {

          step:
            ImportWizardStep.ValidateFile,

          title:
            "Validate",

          description:
            "Validate imported records",

        },

        {

          step:
            ImportWizardStep.Preview,

          title:
            "Preview",

          description:
            "Review imported data",

        },

        {

          step:
            ImportWizardStep.Summary,

          title:
            "Summary",

          description:
            "Complete import",

        },

      ],

      []

    );

  async function loadSelectedFile() {

    if (!state.file) {

      return;

    }

    try {

      const result =
        await importExcel<T>(
          state.file.file
        );

      const records =
        (result as any).records ??
        (result as any).rows ??
        (result as any).data ??
        [];

      if (!result.success) {
        setState(previous => ({
          ...previous,
          rawRecords: [],
          previewRows: [],
          blockingErrors: result.errors,
          isEmptyResult: false,
        }));
        return;
      }

      const validationOutcome = validateImportedData(result, columns, validateRecord);

      const previewRows =
        records.map(
          (
            row: T,
            index: number,
          ) => ({

            index: index + 1,

            data: row,

            hasError: false,

            hasWarning: false,

          })
        );

      setState(previous => ({

        ...previous,

        rawRecords: records,

        previewRows,

        blockingErrors: validationOutcome.blockingErrors,

        isEmptyResult: records.length === 0,

        validation: {
          validRecords: validationOutcome.validRecords,
          invalidRecords: validationOutcome.invalidRecords,
          errors: validationOutcome.rowErrors,
          warnings: [],
        },

      }));

    }

    catch {
      setState(previous => ({
        ...previous,
        blockingErrors: ["The selected file could not be read. Please choose a valid CSV or Excel file."],
      }));
    }

  }

  function buildSummary(): ImportSummary {

    const validation =
      state.validation;

    if (!validation) {

      return {

        totalRows:
          state.rawRecords.length,

        importedRows:
          state.rawRecords.length,

        skippedRows: 0,

        duplicateRows: 0,

        invalidRows: 0,

      };

    }

    return {

      totalRows:

        validation.validRecords.length +

        validation.invalidRecords.length,

      importedRows:

        validation.validRecords.length,

      skippedRows:

        validation.invalidRecords.length,

      duplicateRows: 0,

      invalidRows:

        validation.invalidRecords.length,

    };

  }

  async function goNext() {

    if (

      state.step ===

      ImportWizardStep.SelectFile

    ) {

      await loadSelectedFile();

    }

    setState(previous => ({

      ...previous,

      step:

        Math.min(

          previous.step + 1,

          ImportWizardStep.Summary

        ) as ImportWizardStep,

    }));

  }

      
  function goBack() {

    setState(previous => ({

      ...previous,

      step:

        Math.max(

          previous.step - 1,

          ImportWizardStep.SelectFile

        ) as ImportWizardStep,

    }));

  }

  function finishImport() {
    if (state.blockingErrors?.length || state.isEmptyResult) {
      return;
    }

    const validRecords =
      state.validation?.validRecords ??
      state.rawRecords;

    onImport(validRecords);

    const summary = buildSummary();

    onCompleted?.(summary);

    setState(previous => ({

      ...previous,

      summary,

    }));

    onClose();

  }

  return (

    <MasterDrawer

      open={open}

      title={title}

      onClose={onClose}

    >

      <div className="space-y-6">

        <ImportWizardStepper

          currentStep={state.step}

          steps={steps}

        />

        {state.step ===
          ImportWizardStep.SelectFile && (

          <ImportWizardFileStep

            state={state}

            setState={setState}

            config={{

              open,

              title,

              columns,

              validateRecord,

              onImport,

              onCompleted,

              onClose,

            }}

          />

        )}

        {state.step ===
          ImportWizardStep.ValidateFile && (

          <ImportWizardValidationStep

            state={state}

            setState={setState}

            config={{

              open,

              title,

              columns,

              validateRecord,

              onImport,

              onCompleted,

              onClose,

            }}

          />

        )}

        {state.step ===
          ImportWizardStep.Preview && (

          <ImportWizardPreviewStep

            state={state}

            setState={setState}

            columns={columns}

            config={{

              open,

              title,

              columns,

              validateRecord,

              onImport,

              onCompleted,

              onClose,

            }}

          />

        )}

        {state.step ===
          ImportWizardStep.Summary && (

          <ImportWizardSummaryStep

            state={state}

            setState={setState}

            config={{

              open,

              title,

              columns,

              validateRecord,

              onImport,

              onCompleted,

              onClose,

            }}

          />

        )}

        <div className="flex items-center justify-between border-t pt-6">

          <button

            type="button"

            onClick={onClose}

            className="rounded border px-4 py-2"

          >

            Cancel

          </button>

          <div className="flex gap-3">

            <button

              type="button"

              onClick={goBack}

              disabled={

                state.step ===

                ImportWizardStep.SelectFile

              }

              className="rounded border px-4 py-2 disabled:opacity-50"

            >

              Back

            </button>

            {state.step !==
            ImportWizardStep.Summary ? (

              <button

                type="button"

                onClick={goNext}

                className="rounded bg-blue-600 px-4 py-2 text-white"

              >

                Next

              </button>

            ) : (

              <button

                type="button"

                onClick={finishImport}
                disabled={Boolean(state.blockingErrors?.length || state.isEmptyResult)}

                className="rounded bg-green-600 px-4 py-2 text-white"

              >

                Finish Import

              </button>

            )}

          </div>

        </div>

      </div>

    </MasterDrawer>

  );

}
