import { describe,expect,it } from "vitest";
import type { PersistenceAdapter } from "@/core/persistence/LocalStoragePersistenceAdapter";
import { repositoryFailure,repositorySuccess } from "@/core/persistence/helpers";
import { buildMigrationExportManifest,canonicalizeMigrationValue,deterministicLegacyRentalLine,hashMigrationValue,preserveMigrationRows,serializeMigrationExport,validateForeignKeys } from "@/core/migration";

class MemoryAdapter implements PersistenceAdapter {
  constructor(readonly values=new Map<string,unknown>()){}
  read<T>(key:string){return key==="broken"?repositoryFailure("READ_FAILED","broken",{context:{key},recommendedAction:"repair"}):repositorySuccess((this.values.get(key)??null) as T|null);}
  write<T>(){throw new Error("export must not write");} remove(){throw new Error("export must not remove");}
}

describe("migration export",()=>{
  it("canonicalizes snapshots with stable order, timestamps, missing values and hashes",async()=>{
    const first={unitRate:100,capturedAt:"2026-01-01T08:00:00+08:00",optional:undefined,billingMethod:"Per Hour"};
    const equal={billingMethod:"Per Hour",optional:undefined,capturedAt:"2026-01-01T00:00:00Z",unitRate:100.0};
    expect(canonicalizeMigrationValue(first)).toBe(canonicalizeMigrationValue(equal));
    expect((await hashMigrationValue(first)).checksum).toBe((await hashMigrationValue(equal)).checksum);
    expect((await hashMigrationValue({...equal,unitRate:101})).checksum).not.toBe((await hashMigrationValue(first)).checksum);
    expect(canonicalizeMigrationValue({value:undefined})).not.toBe(canonicalizeMigrationValue({value:null}));
  });

  it("produces deterministic repository counts/checksums without mutation",async()=>{
    const source={schemaVersion:1,records:[{id:"equipment-1",createdAt:"2025-01-01T00:00:00Z"}]};const adapter=new MemoryAdapter(new Map([["equipment",source],["malformed",{oops:true}]]));
    const catalog=[{name:"Equipment",storageKey:"equipment",schemaVersion:1,capabilities:["CRUD" as const]},{name:"Malformed",storageKey:"malformed",schemaVersion:1,capabilities:["CRUD" as const]},{name:"Broken",storageKey:"broken",schemaVersion:1,capabilities:["CRUD" as const]}];
    const input={adapter,catalog,applicationSchemaVersion:1,sourceApplicationVersion:"test",repositoryCatalogVersion:1,exportedAt:"2026-01-01T00:00:00Z"};
    const one=await buildMigrationExportManifest(input),two=await buildMigrationExportManifest(input);
    expect(serializeMigrationExport(one)).toBe(serializeMigrationExport(two));expect(one.repositories[0]).toMatchObject({recordCount:1,status:"Complete"});expect(one.repositories[1].status).toBe("Malformed");expect(one.repositories[2].status).toBe("ReadError");expect(source.records[0].id).toBe("equipment-1");
  });
});

describe("pure migration transformations",()=>{
  it("preserves IDs, timestamps, and persisted billing values exactly",()=>{const source={id:"line-1",createdAt:"2025-01-01T00:00:00Z",subtotal:12.3456,vat:1.4815,withholdingTax:0.2469,grandTotal:13.5802,deurId:"deur-1"};const result=preserveMigrationRows("BillingStatementLine",[source]);expect(result.rows).toEqual([source]);expect(result.rows[0]).not.toBe(source);});
  it("creates one deterministic compatibility line",()=>{const rental={id:"rental-1",equipmentId:"eq-1",operatorId:"op-1",assignmentId:"a-1",status:"Active"};const one=deterministicLegacyRentalLine(rental,[]),two=deterministicLegacyRentalLine(rental,[]);expect(one).toEqual(two);expect(one.rows).toHaveLength(1);expect(one.rows[0].id).toBe("rental-line-rental-1-eq-1");});
  it("reports ambiguity, malformed records, and orphaned references",()=>{expect(deterministicLegacyRentalLine({id:"r1"},[{id:"a",rentalId:"r1"},{id:"b",rentalId:"r1"}])).toMatchObject({success:false,issues:[{code:"MIGRATION_RENTAL_LINE_AMBIGUOUS"}]});expect(preserveMigrationRows("Equipment",[{name:"missing-id"}])).toMatchObject({success:false});expect(validateForeignKeys({repository:"Assignment",rows:[{id:"a",equipmentId:"missing"}],field:"equipmentId",targetIds:new Set()})).toMatchObject([{code:"MIGRATION_ORPHANED_FOREIGN_KEY"}]);});
});
