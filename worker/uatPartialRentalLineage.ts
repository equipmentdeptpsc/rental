export async function readUatPartialRentalLineage(client:any,companyId:string,scenarioKey:string,rentalId:string){
 const result=await client.schema("erp").rpc("inspect_isolated_uat_partial_rental_lineage",{command:{companyId,scenarioKey,rentalId}});
 if(result.error)return{status:"RENTAL_READ_FAILED",error:result.error.message,rental:null,lines:[]};
 const value=result.data as Record<string,unknown>|null;
 if(!value?.success)return{status:String(value?.status??"FORBIDDEN"),rental:null,lines:[]};
 return{status:String(value.status??"RENTAL_READ_FAILED"),rental:value.rental??null,lines:Array.isArray(value.lines)?value.lines:[]};
}
