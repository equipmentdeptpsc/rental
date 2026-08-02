import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationDependencyProvider, createLocalApplicationDependencies } from "@/app/composition";
import { storage } from "@/core/storage";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import type { User } from "@/features/auth/domain/user";
import { OperatorProvider } from "@/features/operators/context/OperatorContext";
import { operatorRepository } from "@/features/operators/repository";
import type { Operator } from "@/features/operators/types";
import UsersPage from "@/features/users/pages/UsersPage";
import { resolveAuthenticatedOperator } from "@/features/rental/deur/operator/resolveAuthenticatedOperator";
import { resolveOperatorAccountLineAccess } from "@/features/rental/deur/operator/resolveOperatorAccountLineAccess";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { UserManagementService } from "@/features/users/services/UserManagementService";

const operators:Operator[]=["a","b"].map((suffix)=>({id:`c8-operator-${suffix}`,name:`Operator ${suffix.toUpperCase()}`,email:"",licenseNumber:suffix,certificationType:"None",status:"Active",joinedDate:"2026-08-02"}));
let mounted:{root:Root;container:HTMLDivElement}|undefined;
afterEach(async()=>{if(mounted){await act(async()=>mounted?.root.unmount());mounted.container.remove();mounted=undefined;}for(const operator of operators)operatorRepository.delete(operator.id);storage.clear();});

async function render(children:(auth:ReturnType<typeof useAuth>)=>ReactNode,dependencies=createLocalApplicationDependencies()){
  let auth!:ReturnType<typeof useAuth>;
  function Probe(){auth=useAuth();return children(auth);}
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);mounted={root,container};
  await act(async()=>root.render(createElement(ApplicationDependencyProvider,{dependencies},createElement(AuthProvider,null,createElement(OperatorProvider,null,createElement(Probe))))));
  return{dependencies,container,auth:()=>auth};
}

describe("Phase C8.0B canonical application User to Operator linkage",()=>{
  it("persists two explicit links and restores each canonical operatorId after sign-in",()=>{
    for(const operator of operators)operatorRepository.create(operator);
    const dependencies=createLocalApplicationDependencies(),repo=dependencies.authentication.userRepository as LocalUserRepository;let sequence=0;
    const service=new UserManagementService(repo,{create:(user,localPassword)=>repo.createUser(user,localPassword)},()=>`c8-user-${++sequence}`,()=>"2026-08-02T00:00:00Z",{getById:(id)=>operatorRepository.getById(id)});
    const admin=repo.getUserByUsername("administrator")!;
    const users=operators.map((operator,index)=>service.create(admin,{username:`c8.operator.${index+1}`,displayName:`C8 Operator ${index+1}`,systemRoles:["rental-operations"],initialPassword:`Password-${index+1}!`,operatorId:operator.id}));
    for(const [index,user] of users.entries()){
      expect(user.id).toBe(`c8-user-${index+1}`);expect(repo.getUserById(user.id)?.operatorId).toBe(operators[index].id);
      const login=dependencies.authentication.authenticationService.login({providerId:"local",payload:{username:user.username,password:`Password-${index+1}!`}});
      expect(login).toMatchObject({success:true,user:{id:user.id,operatorId:operators[index].id}});
      expect(dependencies.authentication.authenticationService.initialize().user).toMatchObject({id:user.id,operatorId:operators[index].id});
      dependencies.authentication.authenticationService.logout();
    }
  });

  it("repairs an existing UAT account only through explicit User Management selection",async()=>{
    for(const operator of operators)operatorRepository.create(operator);
    const dependencies=createLocalApplicationDependencies(),repo=dependencies.authentication.userRepository,service=dependencies.authentication.userManagementService,admin=repo.getUserByUsername("administrator")!;
    const user=service.create(admin,{username:"c8.repair",displayName:"C8 Repair",systemRoles:["rental-operations"],initialPassword:"RepairPassword!"});
    const rendered=await render(()=>createElement(UsersPage),dependencies);
    await act(async()=>{await rendered.auth().login({username:"administrator",password:"Administrator123!"});});
    const row=[...rendered.container.querySelectorAll("tr")].find((item)=>item.textContent?.includes("c8.repair"))!;
    await act(async()=>{(row.querySelector("button") as HTMLButtonElement).click();});
    const selector=rendered.container.querySelector('select[aria-label="Linked operator"]') as HTMLSelectElement;
    selector.value=operators[0].id;await act(async()=>selector.dispatchEvent(new Event("change",{bubbles:true})));
    const save=[...rendered.container.querySelectorAll("button")].find((item)=>item.textContent==="Save User") as HTMLButtonElement;
    await act(async()=>save.click());
    expect(repo.getUserById(user.id)?.operatorId).toBe(operators[0].id);
    expect(rendered.container.textContent).toContain("Sign out and sign back in");
  });

  it("distinguishes missing, unavailable, and valid-but-wrong operator links without name fallback",()=>{
    const base:User={id:"user",username:"Operator A",displayName:"Operator A",systemRoles:["rental-operations"],status:"active",createdAt:"",updatedAt:""};
    expect(resolveAuthenticatedOperator(base,operators)).toEqual({status:"NOT_LINKED",message:"Your user account is not linked to an Operator record. Ask an administrator to update your user account."});
    expect(resolveAuthenticatedOperator({...base,operatorId:"missing"},operators)).toEqual({status:"MAPPED_OPERATOR_MISSING",message:"The Operator linked to your user account is unavailable. Ask an administrator to correct your user account."});
    expect(resolveAuthenticatedOperator({...base,operatorId:operators[0].id},operators)).toMatchObject({status:"RESOLVED",operator:{id:operators[0].id}});
  });

  it("enforces the complete two-user, two-line ownership matrix",()=>{
    const user=(index:number):User=>({id:`user-${index}`,username:`operator ${index}`,displayName:`Operator ${index}`,systemRoles:["rental-operations"],status:"active",operatorId:operators[index].id,createdAt:"",updatedAt:""});
    expect(resolveOperatorAccountLineAccess(user(0),operators,operators[0].id)).toMatchObject({status:"RESOLVED",operator:{id:operators[0].id}});
    expect(resolveOperatorAccountLineAccess(user(1),operators,operators[1].id)).toMatchObject({status:"RESOLVED",operator:{id:operators[1].id}});
    expect(resolveOperatorAccountLineAccess(user(0),operators,operators[1].id)).toEqual({status:"OWNERSHIP_MISMATCH",message:"OWNERSHIP_MISMATCH: This equipment line is assigned to another operator."});
    expect(resolveOperatorAccountLineAccess(user(1),operators,operators[0].id)).toEqual({status:"OWNERSHIP_MISMATCH",message:"OWNERSHIP_MISMATCH: This equipment line is assigned to another operator."});
  });
});
