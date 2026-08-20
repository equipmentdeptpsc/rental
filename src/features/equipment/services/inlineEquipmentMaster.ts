export function createInlineMasterValue(raw: string, existingValues: readonly string[], kind: string) {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { success: false as const, message: `${kind} is required.` };
  if (existingValues.some((existing) => existing.trim().toLocaleLowerCase() === value.toLocaleLowerCase())) return { success: false as const, message: `${kind} already exists.` };
  const slug = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { success: true as const, value, id: `equipment-${kind}-${slug}-${crypto.randomUUID().slice(0, 8)}` };
}
