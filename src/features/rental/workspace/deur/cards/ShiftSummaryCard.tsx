export default function ShiftSummaryCard() {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="text-xl font-semibold">
          Digital DEUR
        </h2>
  
        <p className="mt-1 text-sm text-slate-500">
          Daily Equipment Utilization Report
        </p>
  
        <div className="mt-6 grid gap-4 md:grid-cols-4">
  
          <Metric
            title="Current Status"
            value="Not Started"
          />
  
          <Metric
            title="Operating"
            value="0 min"
          />
  
          <Metric
            title="Idle"
            value="0 min"
          />
  
          <Metric
            title="Meal Break"
            value="0 min"
          />
  
        </div>
  
      </div>
    );
  }
  
  interface MetricProps {
    title: string;
    value: string;
  }
  
  function Metric({
    title,
    value,
  }: MetricProps) {
    return (
      <div className="rounded-lg border p-4">
  
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {title}
        </div>
  
        <div className="mt-2 text-xl font-semibold">
          {value}
        </div>
  
      </div>
    );
  }