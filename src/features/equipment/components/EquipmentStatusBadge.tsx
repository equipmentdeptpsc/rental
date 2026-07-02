type Status = "Available" | "Assigned" | "Maintenance";

interface EquipmentStatusBadgeProps {
  status: Status;
}

export default function EquipmentStatusBadge({
  status,
}: EquipmentStatusBadgeProps) {
  const styles: Record<Status, string> = {
    Available: "bg-green-100 text-green-700",
    Assigned: "bg-blue-100 text-blue-700",
    Maintenance: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}