import { useState } from "react";

import Button from "@/components/ui/Button";

import PrefixTable from "@/features/settings/components/PrefixTable";
import PrefixForm from "@/features/settings/components/PrefixForm";

import { usePrefix } from "@/features/settings";

import type { PrefixRecord } from "@/features/settings/types";

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

  function save(item: PrefixRecord) {
    if (editing) {
      updatePrefix(item);
    } else {
      addPrefix(item);
    }

    closeForm();
  }

  return (
    <div className="p-8 space-y-6">

      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-3xl font-bold">
            Settings
          </h1>

          <p className="text-gray-500 mt-1">
            System configuration and master data.
          </p>
        </div>

        <Button onClick={newPrefix}>
          + New Prefix
        </Button>

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