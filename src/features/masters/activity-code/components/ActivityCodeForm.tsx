import { useEffect, useState } from "react";

import { MasterFormActions } from "@/components/master-data";
import { validateActivityCodeWrite } from "../repository";
import type { ActivityCodeRecord } from "../types";

interface Props {
  editing?: ActivityCodeRecord | null;
  existingRecords?: ActivityCodeRecord[];
  onSave(record: ActivityCodeRecord): void;
  onCancel(): void;
}

const EMPTY_FORM: ActivityCodeRecord = {
  id: "",
  activityCode: "",
  description: "",
  active: true,
  deleted: false,
};

export default function ActivityCodeForm({
  editing,
  existingRecords = [],
  onSave,
  onCancel,
}: Props) {
  const [form, setForm] = useState<ActivityCodeRecord>(EMPTY_FORM);

  useEffect(() => {
    setForm(editing ?? EMPTY_FORM);
  }, [editing]);

  function save() {
    const error = validateActivityCodeWrite(form, existingRecords);
    if (error) {
      alert(error);
      return;
    }

    onSave({
      ...form,
      id: form.id || crypto.randomUUID(),
      activityCode: form.activityCode.trim(),
      description: form.description.trim(),
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Activity Code</label>
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.activityCode}
            onChange={(event) => setForm({ ...form, activityCode: event.target.value })}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Description</label>
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
        />
        Active
      </label>

      <MasterFormActions isEditing={!!editing} onSave={save} onCancel={onCancel} />
    </div>
  );
}
