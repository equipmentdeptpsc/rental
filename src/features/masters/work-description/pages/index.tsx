import { useMemo, useState } from "react";

import { MasterDrawer, MasterPageLayout } from "@/components/master-data";
import { useEquipmentCategories } from "@/features/masters/equipment-category";
import WorkDescriptionForm from "../components/WorkDescriptionForm";
import WorkDescriptionTable from "../components/WorkDescriptionTable";
import { useWorkDescriptions } from "../context";
import type { WorkDescriptionRecord } from "../types";

export default function WorkDescriptionPage() {
  const { records, create, update, softDelete, restore } = useWorkDescriptions();
  const { records: categories } = useEquipmentCategories();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<WorkDescriptionRecord | null>(null);
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => records.filter((record) =>
    !keyword.trim() || record.name.toLowerCase().includes(keyword.trim().toLowerCase()) ||
      record.code.toLowerCase().includes(keyword.trim().toLowerCase())
  ), [records, keyword]);

  function save(record: WorkDescriptionRecord) {
    const result = editing ? update(record) : create(record);
    if (!result.success) { alert(result.message); return; }
    setOpen(false);
  }

  return (
    <div className="p-4 sm:p-8">
      <MasterPageLayout
        title="Work Description Master"
        toolbar={(
          <div className="flex flex-wrap gap-3">
            <input className="min-w-64 rounded border px-3 py-2" placeholder="Search Work Descriptions"
              value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => { setEditing(null); setOpen(true); }}>
              New Work Description
            </button>
          </div>
        )}
        table={<WorkDescriptionTable records={filtered} categories={categories}
          onEdit={(record) => { setEditing(record); setOpen(true); }}
          onDelete={softDelete} onRestore={restore} />}
      />
      <MasterDrawer open={open} title={editing ? "Edit Work Description" : "New Work Description"}
        onClose={() => setOpen(false)}>
        <WorkDescriptionForm editing={editing} existingRecords={records} categories={categories}
          onSave={save} onCancel={() => setOpen(false)} />
      </MasterDrawer>
    </div>
  );
}
