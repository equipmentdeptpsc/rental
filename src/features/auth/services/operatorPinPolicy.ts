export function validateOperatorPin(pin: string): string | undefined {
  if (!/^\d{6}$/.test(pin)) return "Operator PIN must contain exactly 6 numeric digits.";
  const digits = [...pin].map(value => value.charCodeAt(0));
  if (digits.every(value => value === digits[0])) return "Choose a PIN that is not repeated or sequential.";
  const delta = digits[1] - digits[0];
  if ((delta === 1 || delta === -1) && digits.every((value, index) => index === 0 || value - digits[index - 1] === delta)) return "Choose a PIN that is not repeated or sequential.";
  return undefined;
}
