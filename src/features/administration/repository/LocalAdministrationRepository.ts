import type { IStorageService } from "@/core/storage/IStorageService";
import { storage as defaultStorage } from "@/core/storage";
import type { AdminRole, AuthorizationAuditEvent } from "../domain/contracts";

const ROLES_KEY="equipment-rental.rbac.v2.custom-roles",OVERRIDES_KEY="equipment-rental.rbac.v2.role-permission-overrides",AUDIT_KEY="equipment-rental.rbac.v2.audit";
export class LocalAdministrationRepository {
 constructor(private readonly storage:IStorageService=defaultStorage){}
 getCustomRoles():readonly AdminRole[]{return this.storage.get<AdminRole[]>(ROLES_KEY)??[]}
 saveCustomRole(role:AdminRole):AdminRole{const roles=this.getCustomRoles();this.storage.set(ROLES_KEY,[...roles.filter(x=>x.code!==role.code),role]);return role}
 getRolePermissionOverrides():Readonly<Record<string,readonly string[]>>{return this.storage.get<Record<string,readonly string[]>>(OVERRIDES_KEY)??{}}
 getRolePermissionOverride(code:string):readonly string[]|undefined{return this.getRolePermissionOverrides()[code]}
 saveRolePermissionOverride(code:string,permissions:readonly string[]):void{this.storage.set(OVERRIDES_KEY,{...this.getRolePermissionOverrides(),[code]:[...permissions]})}
 removeRolePermissionOverride(code:string):void{const next={...this.getRolePermissionOverrides()};delete next[code];this.storage.set(OVERRIDES_KEY,next)}
 getAuditEvents():readonly AuthorizationAuditEvent[]{return this.storage.get<AuthorizationAuditEvent[]>(AUDIT_KEY)??[]}
 appendAudit(event:AuthorizationAuditEvent):void{this.storage.set(AUDIT_KEY,[...this.getAuditEvents(),event])}
}
