import type { User } from "@/features/auth/domain/user";
import { LocalAdministrationRepository } from "../repository/LocalAdministrationRepository";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";

export class AuthorizationAuditService {
 constructor(private readonly repository=new LocalAdministrationRepository(),private readonly now:()=>string=()=>new Date().toISOString(),private readonly id:()=>string=()=>crypto.randomUUID(),private readonly users:Pick<LocalUserRepository,"getUserById">=new LocalUserRepository()){}
 record(input:{actor:User;targetId:string;action:string;beforeRoles?:readonly string[];afterRoles?:readonly string[];metadata?:Record<string,string>}):void{const target=this.users.getUserById(input.targetId);this.repository.appendAudit({id:this.id(),actorId:input.actor.id,targetType:"USER",targetId:input.targetId,action:input.action,occurredAt:this.now(),companyId:input.actor.companyId,beforeRoleCodes:input.beforeRoles?[...input.beforeRoles].sort():undefined,afterRoleCodes:input.afterRoles?[...input.afterRoles].sort():undefined,metadata:{actorDisplayName:input.actor.displayName,actorUsername:input.actor.username,...(target?{targetDisplayName:target.displayName,targetUsername:target.username}:{}),...input.metadata}})}
 forUser(userId:string){return Object.freeze(this.repository.getAuditEvents().filter(x=>x.targetType==="USER"&&x.targetId===userId).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id)))}
 all(){return Object.freeze([...this.repository.getAuditEvents()].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id)))}
 hasBlockingUserHistory(userId:string){return this.forUser(userId).some(event=>event.action!=="USER_CREATED")}
}
