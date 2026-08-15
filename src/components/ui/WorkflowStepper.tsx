import { Check } from "lucide-react";

export interface WorkflowStep {
  id: string;
  label: string;
  state: "complete" | "current" | "upcoming" | "blocked";
}

export default function WorkflowStepper({ steps }: { steps: readonly WorkflowStep[] }) {
  return (
    <nav aria-label="Rental workflow progress" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                step.state === "current"
                  ? "bg-blue-600 text-white"
                  : step.state === "complete"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : step.state === "blocked"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
              aria-current={step.state === "current" ? "step" : undefined}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                  step.state === "current"
                    ? "bg-white/20"
                    : step.state === "complete"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
                aria-hidden="true"
              >
                {step.state === "complete" ? <Check size={12} /> : index + 1}
              </span>
              {step.label}
            </div>
            {index < steps.length - 1 && (
              <span className="h-px w-4 bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
