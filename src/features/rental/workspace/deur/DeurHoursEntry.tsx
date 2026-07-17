import { useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { saveDeurHours } from "@/features/rental/deur/services/saveDeurHours";
import type { DeurRecord } from "@/features/rental/deur/types";
import { useRentalWorkspaceAggregate } from "..";

interface HoursDraft {
  date: string;
  operating: string;
  idle: string;
}

function draftFrom(deur: DeurRecord | undefined): HoursDraft {
  return {
    date: deur?.workDate ?? "",
    operating: deur ? String(deur.totalOperatingMinutes / 60) : "",
    idle: deur ? String(deur.totalIdleMinutes / 60) : "",
  };
}

function sameDraft(left: HoursDraft, right: HoursDraft) {
  return left.date === right.date && left.operating === right.operating && left.idle === right.idle;
}

export default function DeurHoursEntry() {
  const aggregate = useRentalWorkspaceAggregate();
  const { showToast } = useToast();
  const deur = aggregate.activeDeur;
  const [draft, setDraft] = useState<HoursDraft>(() => draftFrom(deur));
  const [persisted, setPersisted] = useState<HoursDraft>(() => draftFrom(deur));
  const previousDeurId = useRef<string | undefined>(deur?.id);
  const saving = useRef(false);
  const lastSaved = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousDeurId.current === deur?.id) return;
    previousDeurId.current = deur?.id;
    const next = draftFrom(deur);
    setDraft(next);
    setPersisted(next);
    lastSaved.current = undefined;
  }, [deur?.id]);

  if (!deur) return null;

  const deurId = deur.id;
  const locked = Boolean(deur.endOfDay || deur.status === "Billed");
  const dirty = !sameDraft(draft, persisted);

  function update(key: keyof HoursDraft, value: string) {
    lastSaved.current = undefined;
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(complete: boolean) {
    const key = JSON.stringify({ ...draft, complete });
    if (saving.current || lastSaved.current === key) return;

    saving.current = true;
    const result = saveDeurHours(deurId, draft.operating, draft.idle, draft.date, complete);
    saving.current = false;
    if (!result.success || !result.record) {
      showToast(result.message ?? "Unable to save DEUR hours.", "error");
      return;
    }

    const saved = draftFrom(result.record);
    setDraft(saved);
    setPersisted(saved);
    lastSaved.current = key;
    showToast(complete ? "DEUR completed and ready for billing." : "DEUR hours saved.", "success");
  }

  function undo() {
    setDraft(persisted);
    lastSaved.current = undefined;
  }

  return (
    <section className="space-y-4 rounded-xl border bg-white p-6">
      <h2 className="text-xl font-semibold">Daily Operator Hours</h2>
      <p className="text-sm text-slate-500">
        {aggregate.equipment?.assetNo ?? "Unknown equipment"} · {aggregate.operator?.name ?? "Unknown operator"} · {aggregate.project?.projectName ?? "Unknown project"}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <label>Entry Date<input type="date" value={draft.date} disabled={locked} onChange={(event) => update("date", event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label>Operating Hours<input inputMode="decimal" value={draft.operating} disabled={locked} onChange={(event) => update("operating", event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label>Idle Hours<input inputMode="decimal" value={draft.idle} disabled={locked} onChange={(event) => update("idle", event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={locked || !dirty} onClick={() => save(false)}>Save Hours</Button>
        <Button type="button" variant="secondary" disabled={locked || !dirty} onClick={undo}>Undo Changes</Button>
        <Button type="button" variant="success" disabled={locked} onClick={() => save(true)}>Complete End Day</Button>
      </div>
      {dirty && <p className="text-sm text-amber-700">Unsaved changes</p>}
    </section>
  );
}
