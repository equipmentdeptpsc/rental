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
import RolesPage from "@/features/administration/pages/RolesPage";
import PermissionsPage from "@/features/administration/pages/PermissionsPage";
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
  it("renders persistent associated user labels and preserves the password while toggling visibility",async()=>{
    const rendered=await render(()=>createElement(UsersPage));
    await act(async()=>{await rendered.auth().login({username:"administrator",password:"Administrator123!"});});
    const expected=[
      ["Full Name", "user-full-name"],
      ["Username", "user-username"],
      ["Email", "user-email"],
      ["Password", "user-password"],
    ] as const;
    for(const [text,id] of expected){
      const input=rendered.container.querySelector(`#${id}`) as HTMLInputElement;
      const label=rendered.container.querySelector(`label[for="${id}"]`);
      expect(label?.textContent).toContain(text);
      expect(input.labels?.item(0)).toBe(label);
    }
    const password=rendered.container.querySelector("#user-password") as HTMLInputElement;
    expect(password.type).toBe("password");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(password,"PreservedPassword!");
    await act(async()=>password.dispatchEvent(new Event("input",{bubbles:true})));
    const show=rendered.container.querySelector('button[aria-label="Show password"]') as HTMLButtonElement;
    await act(async()=>show.click());
    expect(password.type).toBe("text");
    expect(password.value).toBe("PreservedPassword!");
    const hide=rendered.container.querySelector('button[aria-label="Hide password"]') as HTMLButtonElement;
    await act(async()=>hide.click());
    expect(password.type).toBe("password");
    expect(password.value).toBe("PreservedPassword!");
    const search=rendered.container.querySelector("#user-search") as HTMLInputElement;
    expect(search.labels?.item(0)?.textContent).toContain("Search Users and System Records");
    const headings=[...rendered.container.querySelectorAll("th")].map(x=>x.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Full Name","Username","Email","Roles","Linked Operator","Status","Actions"]));
    const administratorRow=[...rendered.container.querySelectorAll("tbody tr")].find(x=>x.textContent?.includes("administrator"))!;
    expect([...administratorRow.querySelectorAll("td")].map(x=>x.textContent)).toEqual(expect.arrayContaining(["Administrator","administrator","—"]));
    for(const action of ["Edit","View Access","Reset Access","Deactivate"])expect(administratorRow.textContent).toContain(action);
  });

  it("presents selected protected roles with structured permission and assigned-user views",async()=>{
    const rendered=await render(()=>createElement(RolesPage));
    await act(async()=>{await rendered.auth().login({username:"administrator",password:"Administrator123!"});});
    const selected=rendered.container.querySelector("#role-selector") as HTMLSelectElement;
    expect(selected.options).toHaveLength(9);
    expect(selected.value).toBe("system-administrator");
    expect(rendered.container.querySelector('aside[aria-label="Role list"]')).toBeNull();
    expect(rendered.container.textContent).toContain("System role. Name and code are protected.");
    expect(rendered.container.textContent).toContain("Clone Role");
    expect(rendered.container.textContent).not.toContain("Delete");
    expect(rendered.container.textContent).toContain("Default");
    expect(rendered.container.textContent).toContain("Custom Additions");
    selected.value="dispatcher";await act(async()=>selected.dispatchEvent(new Event("change",{bubbles:true})));
    expect(rendered.container.textContent).toContain("Dispatcher");
    const editPermissions=[...rendered.container.querySelectorAll("button")].find(x=>x.textContent==="Edit Permissions") as HTMLButtonElement;
    await act(async()=>editPermissions.click());
    expect(rendered.container.textContent).toContain("Assigned Permissions (");
    expect(rendered.container.textContent).toContain("Available Permissions (");
    for(const id of ["role-permission-search","role-permission-module","role-permission-action","role-permission-risk"])expect((rendered.container.querySelector(`#${id}`) as HTMLInputElement).labels?.length).toBe(1);
    const add=rendered.container.querySelector('button[aria-label^="Add "]') as HTMLButtonElement;
    const addedCode=add.getAttribute("aria-label")!.replace("Add ","");
    await act(async()=>add.click());
    expect(rendered.container.querySelector(`button[aria-label="Remove ${addedCode}"]`)).toBeTruthy();
    expect(rendered.container.textContent).toContain("Added: 1");
    selected.value="operator";await act(async()=>selected.dispatchEvent(new Event("change",{bubbles:true})));
    expect(rendered.container.querySelector('[aria-labelledby="unsaved-role-title"]')?.textContent).toContain("unsaved changes for Dispatcher");
    const stay=[...rendered.container.querySelectorAll("button")].find(x=>x.textContent==="Stay") as HTMLButtonElement;await act(async()=>stay.click());expect(selected.value).toBe("dispatcher");
    expect(rendered.container.textContent).toContain("Save Changes");
    expect(rendered.container.textContent).toContain("Cancel");
    expect(rendered.container.textContent).toContain("Reset To Default");
    const cancel=[...rendered.container.querySelectorAll("button")].find(x=>x.textContent==="Cancel") as HTMLButtonElement;
    await act(async()=>cancel.click());
    const permissions=[...rendered.container.querySelectorAll('button[role="tab"]')].find(x=>x.textContent==="Assigned Permissions") as HTMLButtonElement;
    await act(async()=>permissions.click());
    expect(rendered.container.textContent).toContain("Rental (");
    expect(rendered.container.querySelector("code")?.textContent).toBeTruthy();
    const users=[...rendered.container.querySelectorAll('button[role="tab"]')].find(x=>x.textContent==="Impact Analysis") as HTMLButtonElement;
    await act(async()=>users.click());
    expect(rendered.container.textContent).toContain("Changes to this role will affect");
    expect([...rendered.container.querySelectorAll("th")].map(x=>x.textContent)).toEqual(expect.arrayContaining(["User","Status","Other Roles","Operator Link"]));
  });

  it("filters the grouped read-only permission catalog with labeled controls",async()=>{
    const rendered=await render(()=>createElement(PermissionsPage));
    for(const id of ["permission-search","permission-module","permission-action","permission-risk","permission-state","permission-role"]){const control=rendered.container.querySelector(`#${id}`) as HTMLInputElement;expect(control.labels?.length).toBe(1)}
    const module=rendered.container.querySelector("#permission-module") as HTMLSelectElement;
    module.value="rental";await act(async()=>module.dispatchEvent(new Event("change",{bubbles:true})));
    expect(rendered.container.querySelector("summary")?.textContent).toMatch(/^Rental \(/);
    expect([...rendered.container.querySelectorAll("summary")].every(x=>x.textContent?.startsWith("Rental"))).toBe(true);
    const action=rendered.container.querySelector("#permission-action") as HTMLSelectElement;
    action.value="read";await act(async()=>action.dispatchEvent(new Event("change",{bubbles:true})));
    expect([...rendered.container.querySelectorAll("tbody tr")].every(row=>row.children[1]?.textContent==="read")).toBe(true);
    const risk=rendered.container.querySelector("#permission-risk") as HTMLSelectElement;
    risk.value="READ";await act(async()=>risk.dispatchEvent(new Event("change",{bubbles:true})));
    expect(rendered.container.querySelector("tbody code")?.textContent).toContain("rental.");
    const assignedRole=rendered.container.querySelector("#permission-role") as HTMLSelectElement;
    assignedRole.value="system-administrator";await act(async()=>assignedRole.dispatchEvent(new Event("change",{bubbles:true})));
    expect(rendered.container.textContent).toContain("System Administrator");
    const state=rendered.container.querySelector("#permission-state") as HTMLSelectElement;
    state.value="deprecated";await act(async()=>state.dispatchEvent(new Event("change",{bubbles:true})));
    expect(rendered.container.textContent).toMatch(/Deprecated|No permissions match/);
    expect(rendered.container.querySelector('section[aria-label="Permission filters"]')).toBeTruthy();
  });

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
    const selector=rendered.container.querySelector('[role="dialog"] select[aria-label="Linked operator"]') as HTMLSelectElement;
    selector.value=operators[0].id;await act(async()=>selector.dispatchEvent(new Event("change",{bubbles:true})));
    const save=[...rendered.container.querySelectorAll("button")].find((item)=>item.textContent==="Save Changes") as HTMLButtonElement;
    await act(async()=>save.click());
    expect(repo.getUserById(user.id)?.operatorId).toBe(operators[0].id);
    expect(rendered.container.textContent).toContain("Sign out and sign back in");
  });

  it("opens contextual dialogs and persists deactivate, activate, reset, and access workflows",async()=>{
    const dependencies=createLocalApplicationDependencies(),repo=dependencies.authentication.userRepository;
    const rendered=await render(()=>createElement(UsersPage),dependencies);
    await act(async()=>{await rendered.auth().login({username:"administrator",password:"Administrator123!"});});
    const row=()=>[...rendered.container.querySelectorAll("tr")].find(item=>item.textContent?.includes("Rental Operations"))!;
    const action=(name:string)=>[...row().querySelectorAll("button")].find(item=>item.textContent===name) as HTMLButtonElement;
    const deactivate=action("Deactivate");await act(async()=>deactivate.click());
    expect(rendered.container.querySelector('[role="dialog"]')?.textContent).toContain("This user will no longer be able to sign in");
    const confirm=[...rendered.container.querySelectorAll("button")].find(item=>item.textContent==="Deactivate User") as HTMLButtonElement;
    await act(async()=>confirm.click());expect(repo.getUserByUsername("rental.operations")?.status).toBe("inactive");expect(row().textContent).toContain("Inactive");expect(action("Activate")).toBeTruthy();
    await act(async()=>action("Activate").click());const activate=[...rendered.container.querySelectorAll("button")].find(item=>item.textContent==="Activate User") as HTMLButtonElement;await act(async()=>activate.click());expect(repo.getUserByUsername("rental.operations")?.status).toBe("active");
    const view=action("View Access");await act(async()=>view.click());const access=rendered.container.querySelector('[role="dialog"]')!;expect(access.textContent).toContain("Effective Canonical Access");expect(access.textContent).toContain("Legacy authorization remains runtime authority");const close=rendered.container.querySelector('button[aria-label="Close User Access"]') as HTMLButtonElement;await act(async()=>close.click());expect(document.activeElement).toBe(view);
    await act(async()=>action("Reset Access").click());const password=rendered.container.querySelector("#reset-new-password") as HTMLInputElement,confirmation=rendered.container.querySelector("#reset-confirm-password") as HTMLInputElement;for(const input of [password,confirmation]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,"Replacement2!");await act(async()=>input.dispatchEvent(new Event("input",{bubbles:true})))}const reset=[...rendered.container.querySelectorAll("button")].find(item=>item.textContent==="Reset Access"&&item.closest('[role="dialog"]')) as HTMLButtonElement;await act(async()=>reset.click());expect(rendered.container.textContent).toContain("Access reset successfully");
  });

  it("deletes an unreferenced local test user through destructive confirmation",async()=>{const dependencies=createLocalApplicationDependencies(),repo=dependencies.authentication.userRepository as LocalUserRepository,adminUser=repo.getUserByUsername("administrator")!;const clean={...adminUser,id:"clean-delete",username:"clean.delete",displayName:"Clean Delete",systemRoles:["auditor"],email:"clean.delete@example.com"};repo.createUser(clean,"CleanDelete2!");const rendered=await render(()=>createElement(UsersPage),dependencies);await act(async()=>{await rendered.auth().login({username:"administrator",password:"Administrator123!"})});const row=[...rendered.container.querySelectorAll("tr")].find(item=>item.textContent?.includes("clean.delete"))!;const button=[...row.querySelectorAll("button")].find(item=>item.textContent==="Delete") as HTMLButtonElement;await act(async()=>button.click());expect(rendered.container.querySelector('[role="dialog"]')?.textContent).toContain("cannot be undone");const confirm=[...rendered.container.querySelectorAll("button")].find(item=>item.textContent==="Delete User") as HTMLButtonElement;await act(async()=>confirm.click());expect(repo.getUserById(clean.id)).toBeUndefined();expect(rendered.container.textContent).toContain("Clean Delete was deleted.")});

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
