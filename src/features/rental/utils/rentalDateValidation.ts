export function localCalendarDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateNewRentalDates(dateOut: string, expectedReturn: string, today = localCalendarDate()): string | undefined {
  if (!dateOut) return "Rental start date is required.";
  if (dateOut < today) return "Rental start date cannot be earlier than today.";
  if (!expectedReturn) return "Expected return date is required.";
  if (expectedReturn < dateOut) return "Expected return date cannot be earlier than the rental start date.";
  return undefined;
}
