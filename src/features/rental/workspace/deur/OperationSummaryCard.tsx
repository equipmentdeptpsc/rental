interface Props {
    operatingHours: number;
  
    idleHours: number;
  }
  
  export default function OperationSummaryCard({
    operatingHours,
    idleHours,
  }: Props) {
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h3 className="mb-4 text-lg font-semibold">
          Operating Summary
        </h3>
  
        <div className="grid grid-cols-2 gap-6">
  
          <Metric
            label="Operating Hours"
            value={`${operatingHours} hrs`}
          />
  
          <Metric
            label="Idle Hours"
            value={`${idleHours} hrs`}
          />
  
        </div>
  
      </div>
    );
  }
  
  interface MetricProps {
    label: string;
  
    value: string;
  }
  
  function Metric({
    label,
    value,
  }: MetricProps) {
    return (
      <div>
  
        <div className="text-sm text-slate-500">
          {label}
        </div>
  
        <div className="mt-1 text-2xl font-bold">
          {value}
        </div>
  
      </div>
    );
  }