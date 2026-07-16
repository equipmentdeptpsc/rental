import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { saveDeurHours } from "@/features/rental/deur/services/saveDeurHours";
import { useRentalWorkspaceAggregate } from "..";

export default function DeurHoursEntry() {
  const aggregate = useRentalWorkspaceAggregate();
  const { showToast } = useToast();
  const deur = aggregate.activeDeur;
  const [operating, setOperating] = useState("");
  const [idle, setIdle] = useState("");
  const [date, setDate] = useState("");
  if (!deur) return null;
  const save = (complete: boolean) => {
    const result = saveDeurHours(deur.id, operating, idle, date || deur.workDate || "", complete);
    if (!result.success) { showToast(result.message ?? "Unable to save DEUR hours.", "error"); return; }
    showToast(complete ? "DEUR completed and ready for billing." : "DEUR hours saved.", "success");
  };
  return <section className="rounded-xl border bg-white p-6 space-y-4">
    <h2 className="text-xl font-semibold">Daily Operator Hours</h2>
    <p className="text-sm text-slate-500">{aggregate.equipment?.assetNo ?? "Unknown equipment"} · {aggregate.operator?.name ?? "Unknown operator"} · {aggregate.project?.projectName ?? "Unknown project"}</p>
    <div className="grid gap-4 md:grid-cols-3">
      <label>Entry Date<input type="date" value={date || deur.workDate} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      <label>Operating Hours<input inputMode="decimal" value={operating} onChange={e => setOperating(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      <label>Idle Hours<input inputMode="decimal" value={idle} onChange={e => setIdle(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
    </div>
    <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => save(false)}>Save Hours</Button><Button type="button" variant="success" onClick={() => save(true)}>Complete End Day</Button></div>
  </section>;
}
