interface Props {
    title: string;
    value: number;
    color?: string;
  }
  
  export default function KpiCard({
    title,
    value,
    color = "bg-blue-600",
  }: Props) {
    return (
      <div className="rounded-xl bg-white shadow border p-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-slate-500">
              {title}
            </p>
  
            <h2 className="mt-2 text-3xl font-bold">
              {value}
            </h2>
          </div>
  
          <div
            className={`h-12 w-12 rounded-lg ${color}`}
          />
        </div>
      </div>
    );
  }