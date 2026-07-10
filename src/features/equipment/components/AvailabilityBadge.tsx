interface Props {
    available: boolean;
  }
  
  export default function AvailabilityBadge({
    available,
  }: Props) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          available
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        }`}
      >
        {available
          ? "✓ Ready"
          : "✕ Unavailable"}
      </span>
    );
  }