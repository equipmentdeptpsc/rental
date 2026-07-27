const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatCustomerReviewDateTime(value?: string): string {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? dateTimeFormatter.format(parsed) : "Date unavailable";
}

export function formatCustomerReviewActivityRange(start: string, end?: string): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : undefined;
  if (!Number.isFinite(startDate.getTime())) return "Time unavailable";
  if (!endDate || !Number.isFinite(endDate.getTime())) return `${timeFormatter.format(startDate)} – End time unavailable`;
  const sameDay = startDate.toLocaleDateString("en-PH") === endDate.toLocaleDateString("en-PH");
  return sameDay
    ? `${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`
    : `${dateTimeFormatter.format(startDate)} – ${dateTimeFormatter.format(endDate)}`;
}
