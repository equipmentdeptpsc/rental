interface Props {

    active: boolean;
  
  }
  
  export default function MasterStatusBadge({
  
    active,
  
  }: Props) {
  
    return (
  
      <span
        className={`rounded px-2 py-1 text-xs font-medium ${
          active
            ? "bg-green-100 text-green-700"
            : "bg-slate-200 text-slate-700"
        }`}
      >
  
        {active
          ? "Active"
          : "Inactive"}
  
      </span>
  
    );
  
  }