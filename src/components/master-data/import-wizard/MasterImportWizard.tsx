import {
    importExcel,
  } from "@/shared/import-export/excelImport";

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
              "Check file",
  
          },
  
          {
  
            step:
              ImportWizardStep.Preview,
  
            title:
              "Preview",
  
            description:
              "Review records",
  
          },
  
          {
  
            step:
              ImportWizardStep.Summary,
  
            title:
              "Summary",
  
            description:
              "Finish import",
  
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
      
          setState(previous => ({
      
            ...previous,
      
            rawRecords:
              (result as any).records ??
              (result as any).data ??
              (result as any).rows ??
              [],
      
          }));
      
        }
      
        catch (error) {
      
          console.error(error);
      
        }
      
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

        
  
      onImport(
  
        state.validation?.validRecords ??
  
        []
  
      );
  
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