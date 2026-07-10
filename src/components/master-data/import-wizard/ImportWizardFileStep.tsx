import {
    useRef,
    useState,
  } from "react";
  
  import {
    Upload,
    FileSpreadsheet,
  } from "lucide-react";
  
  import {
    validateImportFile,
  } from "@/shared/import-export/fileValidation";
  
  import type {
    ImportFileInfo,
    WizardStepProps,
  } from "./wizardTypes";
  
  export default function ImportWizardFileStep<T>({
  
    state,
  
    setState,
  
  }: WizardStepProps<T>) {
  
    const inputRef =
      useRef<HTMLInputElement>(null);
  
    const [
  
      errors,
  
      setErrors,
  
    ] = useState<string[]>([]);
  
    function processFile(
  
      file: File
  
    ) {
  
      const result =
        validateImportFile(file);
  
      if (!result.valid) {
  
        setErrors(result.errors);
  
        return;
  
      }
  
      setErrors([]);
  
      const fileInfo: ImportFileInfo = {
  
        file,
  
        fileName: file.name,
  
        extension:
          file.name.split(".").pop()?.toLowerCase() ??
          "",
  
        size: file.size,
  
      };
  
      setState({
  
        ...state,
  
        file: fileInfo,
  
      });
  
    }
  
    function onFileSelected(
  
      e: React.ChangeEvent<HTMLInputElement>
  
    ) {
  
      const file =
        e.target.files?.[0];
  
      if (!file) {
  
        return;
  
      }
  
      processFile(file);
  
    }
  
    function onDrop(
  
      e: React.DragEvent<HTMLDivElement>
  
    ) {
  
      e.preventDefault();
  
      const file =
        e.dataTransfer.files?.[0];
  
      if (!file) {
  
        return;
  
      }
  
      processFile(file);
  
    }
  
    return (
  
      <div className="space-y-6">
  
        <div>
  
          <h3 className="text-lg font-semibold">
  
            Select Import File
  
          </h3>
  
          <p className="mt-1 text-sm text-slate-500">
  
            Supported file types:
  
            Excel (.xlsx)
  
            and CSV (.csv)
  
          </p>
  
        </div>
  
        <div
  
          onDragOver={(e) =>
  
            e.preventDefault()
  
          }
  
          onDrop={onDrop}
  
          onClick={() =>
  
            inputRef.current?.click()
  
          }
  
          className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 transition hover:border-blue-500 hover:bg-blue-50"
  
        >
  
          <div className="flex flex-col items-center">
  
            <Upload
  
              size={42}
  
              className="text-blue-600"
  
            />
  
            <p className="mt-4 font-medium">
  
              Drag & Drop your file here
  
            </p>
  
            <p className="mt-2 text-sm text-slate-500">
  
              or click to browse
  
            </p>
  
          </div>
  
        </div>
  
        <input
  
          ref={inputRef}
  
          hidden
  
          type="file"
  
          accept=".xlsx,.csv"
  
          onChange={onFileSelected}
  
        />
  
        {state.file && (
  
          <div className="rounded-lg border bg-white p-4">
  
            <div className="flex items-center gap-3">
  
              <FileSpreadsheet
  
                className="text-green-600"
  
              />
  
              <div>
  
                <div className="font-medium">
  
                  {state.file.fileName}
  
                </div>
  
                <div className="text-sm text-slate-500">
  
                  {(
  
                    state.file.size / 1024
  
                  ).toFixed(2)} KB
  
                </div>
  
              </div>
  
            </div>
  
          </div>
  
        )}
  
        {errors.length > 0 && (
  
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
  
            <div className="font-semibold text-red-700">
  
              Validation Errors
  
            </div>
  
            <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
  
              {errors.map(
  
                (
  
                  error,
  
                  index
  
                ) => (
  
                  <li key={index}>
  
                    {error}
  
                  </li>
  
                )
  
              )}
  
            </ul>
  
          </div>
  
        )}
  
      </div>
  
    );
  
  }