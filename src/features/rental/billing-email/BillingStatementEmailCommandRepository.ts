export type BillingEmailCommandResult = { success:true;disposition:"ACCEPTED"|"REPLAYED";value:{notificationId:string;status:string} } | { success:false;code:string;message:string;currentVersion?:number };
export interface BillingStatementEmailCommandRepository { enqueue(command:{statementId:string;commandId:string;idempotencyKey:string;expectedVersion:number}):Promise<BillingEmailCommandResult> }

interface RpcClient { schema(name:string):{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>} }
export class SupabaseBillingStatementEmailCommandRepository implements BillingStatementEmailCommandRepository {
  constructor(private readonly client:RpcClient){}
  async enqueue(command:{statementId:string;commandId:string;idempotencyKey:string;expectedVersion:number}):Promise<BillingEmailCommandResult>{
    const {data,error}=await this.client.schema("erp").rpc("command_send_billing_statement_email",{command});
    if(error)return{success:false,code:"TRANSPORT_FAILURE",message:"Unable to queue Billing Statement email."};
    if(!data||typeof data!=="object"||typeof(data as Record<string,unknown>).success!=="boolean")return{success:false,code:"INVALID_RESPONSE",message:"Unable to queue Billing Statement email."};
    return data as BillingEmailCommandResult;
  }
}
