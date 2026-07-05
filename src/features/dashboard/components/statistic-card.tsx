interface StatisticCardProps {
    title: string;
  
    value: number;
  
    className?: string;
  }
  
  export default function StatisticCard({
    title,
    value,
    className = "",
  }: StatisticCardProps) {
    return (
      <div
        className={`rounded-xl border bg-white p-6 shadow-sm ${className}`}
      >
        <div className="text-sm text-gray-500">
          {title}
        </div>
  
        <div className="mt-3 text-4xl font-bold">
          {value}
        </div>
      </div>
    );
  }