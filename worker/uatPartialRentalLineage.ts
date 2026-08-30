export async function readUatPartialRentalLineage(client:any,companyId:string,scenarioKey:string,rentalId:string){
 const result=await client.schema("erp").rpc("inspect_isolated_uat_partial_rental_lineage",{command:{companyId,scenarioKey,rentalId}});
 if(result.error)return{status:"RENTAL_READ_FAILED",error:result.error.message,rental:null,lines:[]};
 const value=result.data as Record<string,unknown>|null;
 if(!value?.success)return{status:String(value?.status??"FORBIDDEN"),rental:null,lines:[]};
 const r=value.rental as any|null; const rental=r?{id:r.id,rental_number:r.rentalNumber,status:r.status,company_id:r.companyId,customer_id:r.customerId,project_id:r.projectId,date_out:r.dateOut,expected_return:r.expectedReturn,row_version:r.rowVersion}:null;
 const lines=Array.isArray(value.lines)?value.lines.map((l:any)=>({id:l.id,status:l.status,company_id:l.companyId,equipment_id:l.equipmentId,assignment_id:l.assignmentId,operator_id:l.operatorId})):[];
 return{status:String(value.status??"RENTAL_READ_FAILED"),rental,lines};
}
