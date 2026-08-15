export default function TabBadge({
  count,
  tone = "warning",
}: {
  count: number;
  tone?: "warning" | "danger" | "info";
}) {
  if (count <= 0) return null;
  const tones = {
    warning: "bg-amber-500 text-white",
    danger: "bg-rose-600 text-white",
    info: "bg-blue-600 text-white",
  };
  return (
    <span
      className={`ml-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none ${tones[tone]}`}
      aria-label={`${count} pending`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
