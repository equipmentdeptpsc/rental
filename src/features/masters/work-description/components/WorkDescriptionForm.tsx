import { useEffect, useState } from "react";

import { MasterFormActions } from "@/components/master-data";
import type { EquipmentCategoryRecord } from "@/features/masters/equipment-category/types";
import { validateWorkDescriptionWrite } from "../repository";
import type { WorkDescriptionRecord } from "../types";

interface Props {
  editing?: WorkDescriptionRecord | null;
  existingRecords: WorkDescriptionRecord[];
  categories: EquipmentCategoryRecord[];
  onSave(record: WorkDescriptionRecord): void;
  onCancel(): void;
}

const empty: WorkDescriptionRecord = {
  id: "",
  code: "",
  name: "",
  active: true,
  deleted: false,
  operatorSelectable: true,
  requiresRemarks: false,
};

export default function WorkDescriptionForm({
  editing,
  existingRecords,
  categories,
  onSave,
  onCancel,
}: Props) {
  const [form, setForm] = useState<WorkDescriptionRecord>(empty);
  useEffect(() => setForm(editing ?? empty), [editing]);

  function save() {
    const candidate = { ...form, id: form.id || crypto.randomUUID() };
    const error = validateWorkDescriptionWrite(candidate, existingRecords);
    if (error) { alert(error); return; }
    onSave(candidate);
  }

  function toggleCategory(id: string) {
    const selected = form.applicableEquipmentCategoryIds ?? [];
    setForm({
      ...form,
      applicableEquipmentCategoryIds: selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    });
  }

  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium">
        Code
        <input className="mt-1 w-full rounded border px-3 py-2" value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })} />
      </label>
      <label className="block text-sm font-medium">
        Name
        <input className="mt-1 w-full rounded border px-3 py-2" value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </label>
      <label className="block text-sm font-medium">
        Sort Order
        <input type="number" className="mt-1 w-full rounded border px-3 py-2"
          value={form.sortOrder ?? ""}
          onChange={(event) => setForm({ ...form, sortOrder: event.target.value ? Number(event.target.value) : undefined })} />
      </label>

      <div className="grid gap-2 sm:grid-cols-3">
        <Check label="Active" checked={form.active} onChange={(value) => setForm({ ...form, active: value })} />
        <Check label="Operator Selectable" checked={form.operatorSelectable !== false}
          onChange={(value) => setForm({ ...form, operatorSelectable: value })} />
        <Check label="Requires Remarks" checked={form.requiresRemarks === true}
          onChange={(value) => setForm({ ...form, requiresRemarks: value })} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Applicable Equipment Categories</legend>
        <p className="mb-2 text-xs text-slate-500">No selection means generally available.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.filter((category) => category.active && !category.deleted).map((category) => (
            <Check key={category.id} label={category.category}
              checked={form.applicableEquipmentCategoryIds?.includes(category.id) ?? false}
              onChange={() => toggleCategory(category.id)} />
          ))}
        </div>
      </fieldset>

      <MasterFormActions isEditing={!!editing} onSave={save} onCancel={onCancel} />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
