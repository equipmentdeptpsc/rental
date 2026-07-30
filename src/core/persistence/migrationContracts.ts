export interface MigrationRecord {
  entityType: string;
  id: string;
  record: Readonly<Record<string, unknown>>;
}

export interface LocalMigrationPackage {
  importId: string;
  source: "LOCAL_STORAGE";
  sourceSchemaVersion: number;
  exportedAt: string;
  records: readonly MigrationRecord[];
  commercialSnapshots: readonly MigrationRecord[];
}

export interface MigrationIssue {
  code: "DUPLICATE_IMPORT" | "DUPLICATE_ID" | "BROKEN_REFERENCE" | "INVALID_RECORD";
  entityType?: string;
  id?: string;
  message: string;
}

export interface MigrationImportRegistry {
  hasImport(importId: string): boolean;
}

export function validateMigrationPackage(
  input: LocalMigrationPackage,
  registry: MigrationImportRegistry,
  references: readonly { entityType: string; id: string; targetType: string; targetId: string }[] = [],
): readonly MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  if (registry.hasImport(input.importId)) {
    issues.push({ code: "DUPLICATE_IMPORT", message: `Import ${input.importId} was already processed.` });
  }
  const identities = new Set<string>();
  for (const item of [...input.records, ...input.commercialSnapshots]) {
    const key = `${item.entityType}:${item.id}`;
    if (identities.has(key)) issues.push({ code: "DUPLICATE_ID", entityType: item.entityType, id: item.id, message: `Duplicate ${key}.` });
    identities.add(key);
  }
  for (const reference of references) {
    if (!identities.has(`${reference.targetType}:${reference.targetId}`)) {
      issues.push({
        code: "BROKEN_REFERENCE",
        entityType: reference.entityType,
        id: reference.id,
        message: `${reference.entityType}:${reference.id} references missing ${reference.targetType}:${reference.targetId}.`,
      });
    }
  }
  return issues;
}
