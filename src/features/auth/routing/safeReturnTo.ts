export function getSafeReturnTo(value: string | null): string | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f]/.test(decoded)
  ) {
    return null;
  }

  const pathname = decoded.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (pathname.toLocaleLowerCase() === "/login") return null;
  return value;
}
