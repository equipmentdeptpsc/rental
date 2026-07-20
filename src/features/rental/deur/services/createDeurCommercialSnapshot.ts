import type { RentalCommercialSnapshot, RentalRecord } from "../../types";
export type CreateDeurCommercialSnapshotResult={success:true;snapshot?:RentalCommercialSnapshot;legacyFallback:boolean}|{success:false;code:"COMMERCIAL_SNAPSHOT_NOT_CAPTURED";message:string};
export function createDeurCommercialSnapshot(rental:RentalRecord):CreateDeurCommercialSnapshotResult{
 if(rental.commercialSnapshot)return{success:true,snapshot:structuredClone(rental.commercialSnapshot),legacyFallback:false};
 if(rental.commercialSnapshotRequired)return{success:false,code:"COMMERCIAL_SNAPSHOT_NOT_CAPTURED",message:"Immutable Rental commercial terms must be captured before creating a DEUR."};
 return{success:true,legacyFallback:true};
}
