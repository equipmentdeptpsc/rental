interface Props {
    label: string;
  
    completed: boolean;
  }
  
  export default function CloseRequirementItem({
    label,
    completed,
  }: Props) {
    return (
      <div className="flex items-center justify-between rounded-lg border p-4">
  
        <span>
  
          {label}
  
        </span>
  
        <span
          className={`rounded px-3 py-1 text-sm font-medium ${
            completed
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {completed ? "Ready" : "Pending"}
        </span>
  
      </div>
    );
  }