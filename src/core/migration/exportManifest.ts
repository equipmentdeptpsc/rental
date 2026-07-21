import type { PersistenceAdapter } from "@/core/persistence/LocalStoragePersistenceAdapter";
import type { RepositoryDescriptor } from "@/core/persistence/contracts";
import { canonicalizeMigrationValue, hashMigrationValue } from "./canonicalization";

export const MIGRATION_EXPORT_MANIFEST_VERSION = 1;
export interface MigrationExportRepository { logicalName:string; storageKey:string; sourceSchemaVersion:number; recordCount:number; checksum:string; checksumAlgorithm:string; dependencyOrder:number; status:"Complete"|"Malformed"|"ReadError"; warnings:string[]; payload:unknown }
export interface MigrationExportManifest { manifestVersion:number; applicationSchemaVersion:number; exportedAt:string; sourceApplicationVersion:string; repositoryCatalogVersion:number; completionStatus:"Complete"|"CompletedWithWarnings"; repositories:MigrationExportRepository[]; checksum:string; checksumAlgorithm:string }

function recordsFrom(value: unknown): { records:unknown[]; schemaVersion:number; warning?:string } | undefined {
  if (Array.isArray(value)) return { records:value, schemaVersion:0, warning:"Legacy unversioned array." };
  if (value && typeof value === "object" && Array.isArray((value as {records?:unknown}).records)) return { records:(value as {records:unknown[]}).records, schemaVersion:Number((value as {schemaVersion?:unknown}).schemaVersion ?? 0) };
  return undefined;
}

export async function buildMigrationExportManifest(input:{ adapter:PersistenceAdapter; catalog:readonly RepositoryDescriptor[]; applicationSchemaVersion:number; sourceApplicationVersion:string; repositoryCatalogVersion:number; exportedAt:string }):Promise<MigrationExportManifest> {
  const repositories:MigrationExportRepository[]=[];
  for (const [dependencyOrder, descriptor] of input.catalog.entries()) {
    const read=input.adapter.read<unknown>(descriptor.storageKey);
    if (!read.success) { repositories.push({ logicalName:descriptor.name,storageKey:descriptor.storageKey,sourceSchemaVersion:descriptor.schemaVersion,recordCount:0,checksum:"",checksumAlgorithm:"sha256-canonical-json-v1",dependencyOrder,status:"ReadError",warnings:[`${read.error.code}: ${read.error.message}`],payload:null }); continue; }
    const parsed=recordsFrom(read.value);
    const status=read.value===null||parsed ? "Complete" : "Malformed";
    const payload=read.value;
    const digest=await hashMigrationValue(payload);
    repositories.push({ logicalName:descriptor.name,storageKey:descriptor.storageKey,sourceSchemaVersion:parsed?.schemaVersion ?? descriptor.schemaVersion,recordCount:parsed?.records.length ?? 0,checksum:digest.checksum,checksumAlgorithm:digest.algorithm,dependencyOrder,status,warnings:[...(parsed?.warning?[parsed.warning]:[]),...(status==="Malformed"?["Repository payload is neither an array nor a versioned records envelope."]:[])],payload });
  }
  const completionStatus:MigrationExportManifest["completionStatus"]=repositories.every((item)=>item.status==="Complete"&&item.warnings.length===0)?"Complete":"CompletedWithWarnings";
  const unsigned={ manifestVersion:MIGRATION_EXPORT_MANIFEST_VERSION,applicationSchemaVersion:input.applicationSchemaVersion,exportedAt:input.exportedAt,sourceApplicationVersion:input.sourceApplicationVersion,repositoryCatalogVersion:input.repositoryCatalogVersion,completionStatus,repositories };
  const digest=await hashMigrationValue(unsigned);
  return { ...unsigned, checksum:digest.checksum,checksumAlgorithm:digest.algorithm };
}

export function serializeMigrationExport(manifest:MigrationExportManifest):string { return canonicalizeMigrationValue(manifest); }
