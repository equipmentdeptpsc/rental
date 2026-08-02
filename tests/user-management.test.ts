import { describe, expect, it } from "vitest";
import type { User } from "@/features/auth/domain/user";
import type { UserRepository } from "@/features/auth/repository/UserRepository";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import { UserManagementService } from "@/features/users/services/UserManagementService";
import type { Operator } from "@/features/operators/types";

const admin: User = { id:"a",username:"admin",displayName:"Admin",systemRoles:["system-administrator"],status:"active",createdAt:"",updatedAt:"" };
const manager: User = { id:"m",username:"manager",displayName:"Manager",systemRoles:["management"],status:"active",createdAt:"",updatedAt:"" };
const operator=(id:string,status:Operator["status"]="Active"):Operator=>({id,name:id,email:"",licenseNumber:"",certificationType:"None",status,joinedDate:""});

class MemoryUsers implements UserRepository {
  constructor(public records: User[] = [admin, manager]) {}
  getUsers(){return this.records.map(user=>({...user,systemRoles:[...user.systemRoles]}));}
  getUserById(id:string){return this.getUsers().find(user=>user.id===id);}
  getUserByUsername(username:string){return this.getUsers().find(user=>user.username.toLowerCase()===username.trim().toLowerCase());}
  createUser(user:User){if(this.getUserByUsername(user.username))throw Error("Username already exists");this.records.push(user);return user;}
  updateUser(user:User){if(this.records.some(item=>item.id!==user.id&&item.username.toLowerCase()===user.username.toLowerCase()))throw Error("Username already exists");this.records=this.records.map(item=>item.id===user.id?user:item);return user;}
  activateUser(id:string){return this.status(id,"active");}
  deactivateUser(id:string){return this.status(id,"inactive");}
  private status(id:string,status:User["status"]){const user=this.getUserById(id);if(!user)throw Error("missing");return this.updateUser({...user,status});}
}

function setup(records?:User[],operators:Operator[]=[operator("operator-1"),operator("operator-2"),operator("inactive-operator","Suspended")]){
  const repo=new MemoryUsers(records);
  const provisioned:{user:User;password:string}[]=[];
  const service=new UserManagementService(repo,{create:(user,password)=>{provisioned.push({user,password});return repo.createUser(user);}},()=>"new-user",()=>"2026-07-28T00:00:00Z",{getById:(id)=>operators.find(item=>item.id===id)});
  return{repo,service,provisioned};
}

describe("UserManagementService",()=>{
  it("lists and searches without exposing credentials",()=>{const{service}=setup();expect(service.list(admin)).toHaveLength(2);expect(service.search(admin,"MANAG")).toEqual([manager]);expect("password" in service.list(admin)[0]).toBe(false);});
  it("rejects unauthorized administration without mutation",()=>{const{repo,service}=setup();const before=repo.getUsers();expect(()=>service.create(manager,{username:"x",displayName:"X",systemRoles:["finance"],initialPassword:"secret"})).toThrow(AuthorizationError);expect(repo.getUsers()).toEqual(before);});
  it("creates a linked local user through the credential boundary",()=>{const{service,provisioned}=setup();const created=service.create(admin,{username:" operator.two ",displayName:" Operator Two ",systemRoles:["rental-operations","rental-operations"],initialPassword:"secret",operatorId:"operator-1"});expect(created).toMatchObject({id:"new-user",username:"operator.two",displayName:"Operator Two",systemRoles:["rental-operations"],operatorId:"operator-1"});expect(provisioned).toEqual([{user:created,password:"secret"}]);});
  it("preserves case-insensitive duplicate protection",()=>{const{service}=setup();expect(()=>service.create(admin,{username:"MANAGER",displayName:"Duplicate",systemRoles:["management"],initialPassword:"secret"})).toThrow("Username already exists");});
  it("edits identity, roles, and operator linkage",()=>{const{service}=setup();expect(service.update(admin,"m",{username:"leader",displayName:"Leader",systemRoles:["rental-operations"],operatorId:"operator-1"})).toMatchObject({username:"leader",systemRoles:["rental-operations"],operatorId:"operator-1"});});
  it("rejects missing, inactive, role-incompatible, and duplicate active links",()=>{const linked:User={...manager,id:"linked",username:"linked",systemRoles:["rental-operations"],operatorId:"operator-1"};const{service}=setup([admin,manager,linked]);expect(()=>service.update(admin,"m",{username:"manager",displayName:"Manager",systemRoles:["rental-operations"],operatorId:"missing"})).toThrow("active canonical Operator");expect(()=>service.update(admin,"m",{username:"manager",displayName:"Manager",systemRoles:["rental-operations"],operatorId:"inactive-operator"})).toThrow("active canonical Operator");expect(()=>service.update(admin,"m",{username:"manager",displayName:"Manager",systemRoles:["management"],operatorId:"operator-2"})).toThrow("Only a Rental Operations");expect(()=>service.update(admin,"m",{username:"manager",displayName:"Manager",systemRoles:["rental-operations"],operatorId:"operator-1"})).toThrow("already linked");});
  it("prevents self-deactivation",()=>{const{service}=setup();expect(()=>service.deactivate(admin,"a")).toThrow("own active account");});
  it("retains at least one active System Administrator",()=>{const second={...admin,id:"b",username:"admin2"};const{service}=setup([admin,second,manager]);expect(service.deactivate(admin,"b").status).toBe("inactive");expect(()=>service.update(admin,"a",{username:"admin",displayName:"Admin",systemRoles:["management"]})).toThrow("final active System Administrator");});
});
