interface Props {

    label: string;
  
    onClick: () => void;
  
    disabled?: boolean;
  
  }
  
  export default function ActivityButton({
  
    label,
  
    onClick,
  
    disabled,
  
  }: Props) {
  
    return (
  
      <button
        onClick={onClick}
        disabled={disabled}
        className="
          rounded-lg
          border
          bg-blue-600
          px-4
          py-2
          text-white
          hover:bg-blue-700
          disabled:bg-slate-300
        "
      >
  
        {label}
  
      </button>
  
    );
  
  }