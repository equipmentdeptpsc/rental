interface Props {
    label: string;
  
    value: string;
  }
  
  export default function CollectionMetricCard({
    label,
    value,
  }: Props) {
    return (
      <div className="rounded-lg border bg-white p-5">
  
        <div className="text-sm text-slate-500">
  
          {label}
  
        </div>
  
        <div className="mt-2 text-2xl font-semibold">
  
          {value}
  
        </div>
  
      </div>
    );
  }