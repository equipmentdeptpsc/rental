const phpCurrency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPhpCurrency(value: number): string {
  return phpCurrency.format(Number.isFinite(value) ? value : 0);
}

export function formatOperationalHours(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(2)} h`;
}
