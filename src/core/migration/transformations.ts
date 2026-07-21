export interface MigrationIssue { code:string; message:string; repository:string; recordId?:string; context:Record<string,unknown> }
export type MigrationResult<T>={ success:true; rows:T[]; issues:MigrationIssue[] }|{ success:false; rows:T[]; issues:MigrationIssue[] };

function record(value:unknown):value is Record<string,unknown>{ return Boolean(value)&&typeof value==="object"&&!Array.isArray(value); }
export function preserveMigrationRows(repository:string, values:unknown[]):MigrationResult<Record<string,unknown>> {
  const rows:Record<string,unknown>[]=[],issues:MigrationIssue[]=[];
  for(const value of values){ if(!record(value)||typeof value.id!=="string"||!value.id){issues.push({code:"MIGRATION_RECORD_INVALID",message:"Record must be an object with a non-empty string ID.",repository,context:{value}});continue;} rows.push(structuredClone(value)); }
  return { success:issues.length===0,rows,issues };
}
export function validateForeignKeys(input:{repository:string;rows:Record<string,unknown>[];field:string;targetIds:ReadonlySet<string>;optional?:boolean}):MigrationIssue[]{
  return input.rows.flatMap((row)=>{const value=row[input.field];if((value===undefined||value===null||value==="")&&input.optional)return[];return typeof value==="string"&&input.targetIds.has(value)?[]:[{code:"MIGRATION_ORPHANED_FOREIGN_KEY",message:`${input.field} does not resolve.`,repository:input.repository,recordId:typeof row.id==="string"?row.id:undefined,context:{field:input.field,value}}];});
}
export function deterministicLegacyRentalLine(rental:Record<string,unknown>,existingLines:Record<string,unknown>[]):MigrationResult<Record<string,unknown>>{
  const id=typeof rental.id==="string"?rental.id:"";const matches=existingLines.filter((line)=>line.rentalId===id);
  if(matches.length>1)return{success:false,rows:[],issues:[{code:"MIGRATION_RENTAL_LINE_AMBIGUOUS",message:"Legacy Rental resolves to multiple equipment lines.",repository:"RentalEquipmentLine",recordId:id,context:{lineIds:matches.map((line)=>line.id)}}]};
  if(matches.length===1)return{success:true,rows:[structuredClone(matches[0])],issues:[]};
  if(!id||typeof rental.equipmentId!=="string"||typeof rental.operatorId!=="string")return{success:false,rows:[],issues:[{code:"MIGRATION_RENTAL_LINE_UNRESOLVED",message:"Legacy Rental lacks deterministic equipment/operator identity.",repository:"Rental",recordId:id||undefined,context:{equipmentId:rental.equipmentId,operatorId:rental.operatorId}}]};
  return{success:true,rows:[{id:`rental-line-${id}-${rental.equipmentId}`,rentalId:id,equipmentId:rental.equipmentId,operatorId:rental.operatorId,assignmentId:rental.assignmentId,status:rental.status,operationalMetadata:structuredClone(rental.operationalMetadata??{})}],issues:[]};
}
