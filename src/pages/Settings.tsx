import { useState } from "react";
import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import PrefixTable from "@/features/settings/components/PrefixTable";
import PrefixForm from "@/features/settings/components/PrefixForm";

import { usePrefix } from "@/features/settings";

import type { PrefixRecord } from "@/features/settings/types";
import {
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_FILE_SIZE_BYTES,
  backupFilename,
  createApplicationBackup,
  parseApplicationBackup,
  resetApplicationData,
  resetTransactionalData,
  restoreApplicationBackup,
  serializeApplicationBackup,
  type RestorePreview,
} from "@/features/settings/services/applicationBackupService";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import type { DeurShiftWindowDefinition } from "@/features/rental/types";
import { normalizeDeurShiftWindow } from "@/features/rental/deur/shift-window/normalizeDeurShiftWindow";

export default function Settings() {
  const {
    prefixes,
    addPrefix,
    updatePrefix,
  } = usePrefix();

  const [editing, setEditing] =
    useState<PrefixRecord | null>(null);

  const [showForm, setShowForm] =
    useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [backupError, setBackupError] = useState("");
  const [shiftWindows, setShiftWindows] = useState(() => deurShiftWindowRepository.getAll());
  const [shiftWindowErrors, setShiftWindowErrors] = useState<Record<string, string>>({});

  function changeShiftWindow(code: string, field: keyof DeurShiftWindowDefinition, value: string) {
    setShiftWindows((current) => current.map((window) => window.code === code ? { ...window, [field]: value } : window));
  }

  function saveShiftWindow(window: DeurShiftWindowDefinition) {
    const normalized = normalizeDeurShiftWindow(window);
    if (!normalized.valid) { setShiftWindowErrors((current) => ({ ...current, [window.code]: normalized.message })); return; }
    try {
      deurShiftWindowRepository.update(normalized.value, new Date().toISOString());
      setShiftWindows(deurShiftWindowRepository.getAll());
      setShiftWindowErrors((current) => ({ ...current, [window.code]: "" }));
    } catch (error) { setShiftWindowErrors((current) => ({ ...current, [window.code]: error instanceof Error ? error.message : "Could not save shift window." })); }
  }

  function downloadBackup(json = serializeApplicationBackup()) {
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    anchor.href = url;
    anchor.download = backupFilename();
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function onBackup() {
    try {
      setBackupError("");
      downloadBackup();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Could not create backup.");
    }
  }

  async function onRestoreFile(file: File | undefined) {
    setRestorePreview(null);
    setBackupError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json") || (file.type && file.type !== "application/json" && file.type !== "text/json")) {
      setBackupError("Select a JSON backup file.");
      return;
    }
    if (file.size > MAX_BACKUP_FILE_SIZE_BYTES) {
      setBackupError("Backup files must be 5 MB or smaller.");
      return;
    }
    try {
      setRestorePreview(parseApplicationBackup(await file.text()));
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Could not validate backup.");
    }
  }

  function confirmRestore() {
    if (!restorePreview || !window.confirm("Replace all application data with this backup? Your current application data will be downloaded first.")) return;
    try {
      downloadBackup(JSON.stringify(createApplicationBackup(), null, 2));
      restoreApplicationBackup(restorePreview);
      window.location.reload();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Restore failed. No data was changed.");
    }
  }

  function confirmReset(allData: boolean) {
    const message = allData
      ? "Remove all Equipment Rental System data (except your signed-in session)? Download a backup first."
      : "Remove transactional test data while keeping master data and your signed-in session?";
    if (!window.confirm(message)) return;
    allData ? resetApplicationData() : resetTransactionalData();
    window.location.reload();
  }

  function newPrefix() {
    setEditing(null);
    setShowForm(true);
  }

  function editPrefix(
    item: PrefixRecord
  ) {
    setEditing(item);
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setShowForm(false);
  }

  function save(item: Omit<PrefixRecord, "id">) {
    const result = editing ? updatePrefix({ ...item, id: editing.id }) : addPrefix({ ...item, id: crypto.randomUUID() });
    if (!result.success) return result;
    closeForm();
    return { success: true as const };
  }

  return (
    <div className="space-y-6 p-4 sm:p-8">

      <div className="flex flex-wrap items-center justify-between gap-4">

        <div>
          <h1 className="text-3xl font-bold">
            Settings
          </h1>

          <p className="text-gray-500 mt-1">
            System configuration and master data.
          </p>
        </div>

        <Button type="button" onClick={newPrefix}>
          + New Prefix
        </Button>

      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-2xl font-semibold">DEUR Shift Windows</h2>
        <p className="mb-4 text-gray-500">These windows define expectation due times only. Released Rentals retain immutable copies.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {shiftWindows.map((window) => <div key={window.code} className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold">{window.code}</h3>
            <label className="block text-sm">Label<input className="mt-1 w-full rounded border p-2" value={window.label} onChange={(event) => changeShiftWindow(window.code, "label", event.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Start<input type="time" className="mt-1 w-full rounded border p-2" value={window.startTime} onChange={(event) => changeShiftWindow(window.code, "startTime", event.target.value)} /></label><label className="block text-sm">End<input type="time" className="mt-1 w-full rounded border p-2" value={window.endTime} onChange={(event) => changeShiftWindow(window.code, "endTime", event.target.value)} /></label></div>
            <label className="block text-sm">Timezone<input className="mt-1 w-full rounded border p-2" value={window.timezone} onChange={(event) => changeShiftWindow(window.code, "timezone", event.target.value)} /></label>
            {window.endTime <= window.startTime && window.endTime !== window.startTime && <p className="text-xs text-blue-700">Crosses midnight (ends next day)</p>}
            {shiftWindowErrors[window.code] && <p className="text-sm text-red-700">{shiftWindowErrors[window.code]}</p>}
            <Button onClick={() => saveShiftWindow(window)}>Save {window.code}</Button>
          </div>)}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">

        <h2 className="text-2xl font-semibold">
          Equipment Prefix Master
        </h2>

        <p className="text-gray-500 mb-6">
          Manage equipment numbering prefixes.
        </p>

        <PrefixTable
          prefixes={prefixes}
          onEdit={editPrefix}
        />

      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-2xl font-semibold">Activity Code Master</h2>
        <p className="mb-4 text-gray-500">
          Manage operational Activity Codes and their active status.
        </p>
        <Link
          to="/settings/activity-codes"
          className="inline-flex rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
        >
          Manage Activity Codes
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-2xl font-semibold">Work Description Master</h2>
        <p className="mb-4 text-gray-500">
          Manage the compact list of principal work performed during a DEUR day or shift.
        </p>
        <Link
          to="/settings/work-descriptions"
          className="inline-flex rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
        >
          Manage Work Descriptions
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Data Backup and Restore</h2>
          <p className="text-gray-500">Backups include application records and master data, never your authentication session.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onBackup}>Download Backup</Button>
          <label className="rounded-lg px-5 py-3 font-medium border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer">
            Select Backup to Restore
            <input className="hidden" type="file" accept="application/json,.json" onChange={(event) => void onRestoreFile(event.target.files?.[0])} />
          </label>
        </div>
        {backupError && <p className="text-sm text-red-700">{backupError}</p>}
        {restorePreview && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm space-y-2">
            <p><strong>Ready for full replacement restore.</strong></p>
            <p>Exported: {new Date(restorePreview.backup.exportedAt).toLocaleString()} · Schema: {restorePreview.backup.schemaVersion}</p>
            <p>Sections: {restorePreview.sections.length} · Records: {Object.values(restorePreview.backup.recordCounts).reduce((total, count) => total + count, 0)}</p>
            <Button onClick={confirmRestore} variant="danger">Confirm Restore</Button>
          </div>
        )}
        <p className="text-xs text-gray-500">Storage schema version: {BACKUP_SCHEMA_VERSION}. Existing installations without metadata are treated as this legacy-compatible version.</p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-red-900">Controlled Data Reset</h2>
          <p className="text-red-800">Download a backup first. These actions do not affect unrelated browser storage or your sign-in session.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => confirmReset(false)}>Reset Transactional Test Data</Button>
          <Button variant="danger" onClick={() => confirmReset(true)}>Reset All Application Data</Button>
        </div>
      </div>

      {showForm && (
        <PrefixForm
          initialData={editing}
          onSave={save}
          onCancel={closeForm}
        />
      )}

    </div>
  );
}
