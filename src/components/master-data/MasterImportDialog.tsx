import {
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
  } from "react";
  
  interface Props {
  
    open: boolean;
  
    title?: string;
  
    onClose(): void;
  
    onImport(
      file: File
    ): void;
  
  }
  
  export default function MasterImportDialog({
  
    open,
  
    title = "Import Data",
  
    onClose,
  
    onImport,
  
  }: Props) {
  
    const fileInputRef =
      useRef<HTMLInputElement>(
        null
      );
  
    const [
  
      selectedFile,
  
      setSelectedFile,
  
    ] =
    useState<File | null>(
      null
    );
  
    const [
  
      validationMessage,
  
      setValidationMessage,
  
    ] =
    useState("");
  
    const [
  
      dragging,
  
      setDragging,
  
    ] =
    useState(false);
  
    if (!open) {
  
      return null;
  
    }
  
    function validateFile(
      file: File
    ): boolean {
  
      const fileName =
        file.name.toLowerCase();
  
      const isValid =
  
        fileName.endsWith(
          ".xlsx"
        )
  
        ||
  
        fileName.endsWith(
          ".csv"
        );
  
      if (!isValid) {
  
        setValidationMessage(
  
          "Only .xlsx and .csv files are supported."
  
        );
  
        return false;
  
      }
  
      setValidationMessage("");
  
      return true;
  
    }
  
    function selectFile(
      file: File
    ) {
  
      if (
        !validateFile(file)
      ) {
  
        return;
  
      }
  
      setSelectedFile(
        file
      );
  
    }
  
    function handleBrowse(
      e: ChangeEvent<HTMLInputElement>
    ) {
  
      const file =
        e.target.files?.[0];
  
      if (!file) {
  
        return;
  
      }
  
      selectFile(file);
  
    }
  
    function handleDrop(
      e: DragEvent<HTMLDivElement>
    ) {
  
      e.preventDefault();
  
      setDragging(false);
  
      const file =
        e.dataTransfer.files?.[0];
  
      if (!file) {
  
        return;
  
      }
  
      selectFile(file);
  
    }
  
    function handleDragOver(
      e: DragEvent<HTMLDivElement>
    ) {
  
      e.preventDefault();
  
      setDragging(true);
  
    }
  
    function handleDragLeave() {
  
      setDragging(false);
  
    }
  
    function removeFile() {
  
      setSelectedFile(
        null
      );
  
      setValidationMessage(
        ""
      );
  
      if (
        fileInputRef.current
      ) {
  
        fileInputRef.current.value =
          "";
  
      }
  
    }
  
    function executeImport() {
  
      if (
        !selectedFile
      ) {
  
        setValidationMessage(
  
          "Please select a file first."
  
        );
  
        return;
  
      }
  
      onImport(
        selectedFile
      );
  
    }
  
    return (
  
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
  
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
  
          <div className="flex items-center justify-between border-b p-4">
  
            <h2 className="text-lg font-semibold">
  
              {title}
  
            </h2>
  
            <button
              onClick={onClose}
              className="rounded border px-3 py-1"
            >
  
              Close
  
            </button>
  
          </div>
  
          <div className="space-y-4 p-6">
  
            <div
  
              onDrop={
                handleDrop
              }
  
              onDragOver={
                handleDragOver
              }
  
              onDragLeave={
                handleDragLeave
              }
  
              className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
                dragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-300"
              }`}
  
            >
  
              <p className="text-sm text-slate-600">
  
                Drag and drop Excel or CSV file here
  
              </p>
  
              <p className="mt-1 text-xs text-slate-400">
  
                Supported formats: .xlsx, .csv
  
              </p>
  
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="mt-4 rounded border px-4 py-2 text-sm hover:bg-slate-100"
              >
  
                Browse Files
  
              </button>
  
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={
                  handleBrowse
                }
                className="hidden"
              />
  
            </div>
  
            {selectedFile && (
  
              <div className="rounded-lg border bg-slate-50 p-4">
  
                <div className="flex items-center justify-between">
  
                  <div>
  
                    <div className="font-medium">
  
                      Selected File
  
                    </div>
  
                    <div className="text-sm text-slate-600">
  
                      {
                        selectedFile.name
                      }
  
                    </div>
  
                    <div className="text-xs text-slate-500">
  
                      {(
                        selectedFile.size /
                        1024
                      ).toFixed(2)}
                      {" "}
                      KB
  
                    </div>
  
                  </div>
  
                  <button
                    onClick={
                      removeFile
                    }
                    className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
  
                    Remove
  
                  </button>
  
                </div>
  
              </div>
  
            )}
  
            {validationMessage && (
  
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
  
                {
                  validationMessage
                }
  
              </div>
  
            )}
  
            <div className="rounded-lg border bg-slate-50 p-4">
  
              <div className="font-medium">
  
                Import Preview
  
              </div>
  
              <div className="mt-2 text-sm text-slate-500">
  
                Preview and validation
                will be available in
                the next sprint batch.
  
              </div>
  
            </div>
  
          </div>
  
          <div className="flex justify-end gap-2 border-t p-4">
  
            <button
              onClick={onClose}
              className="rounded border px-4 py-2 hover:bg-slate-100"
            >
  
              Cancel
  
            </button>
  
            <button
              onClick={
                executeImport
              }
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
  
              Import
  
            </button>
  
          </div>
  
        </div>
  
      </div>
  
    );
  
  }