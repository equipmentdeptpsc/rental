import type { EquipmentStatus } from "../types";

interface Props {
  status: EquipmentStatus;
}

const styles: Record<
  EquipmentStatus,
  string
> = {
  Available:
    "bg-green-100 border-green-300 text-green-700",

  Assigned:
    "bg-blue-100 border-blue-300 text-blue-700",

  Rented:
    "bg-purple-100 border-purple-300 text-purple-700",

  Maintenance:
    "bg-yellow-100 border-yellow-300 text-yellow-700",
};

const icons: Record<
  EquipmentStatus,
  string
> = {
  Available: "✓",

  Assigned: "👤",

  Rented: "🚚",

  Maintenance: "🔧",
};

export default function EquipmentStatusBadge({
  status,
}: Props) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${styles[status]}`}
    >
      <span>{icons[status]}</span>

      {status}
    </span>
  );
}