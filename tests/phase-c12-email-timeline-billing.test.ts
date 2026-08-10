import { describe, expect, it } from "vitest";
import type { User } from "@/features/auth/domain/user";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { UserManagementService } from "@/features/users/services/UserManagementService";
import { resolveManagerReviewer } from "@/features/users/services/resolveManagerReviewer";
import { buildCustomerReviewTimeline } from "@/features/rental/customer-review/buildCustomerReviewSnapshot";
import { renderNotificationTemplate } from "@/features/notifications/templates";
import { BillingRateEngine } from "@/features/rental/billing/engine";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { IStorageService } from "@/core/storage/IStorageService";
import { AUTH_USERS_STORAGE_KEY } from "@/features/auth/repository/localStorageSchema";
import { readFileSync } from "node:fs";

class MemoryStorage implements IStorageService {
  private values = new Map<string, unknown>();
  get<T>(key:string){return structuredClone(this.values.get(key) ?? null) as T|null;}
  set<T>(key:string,value:T){this.values.set(key,structuredClone(value));}
  remove(key:string){this.values.delete(key);}
  clear(){this.values.clear();}
}

const admin:User={id:"admin",username:"admin",displayName:"Admin",systemRoles:["system-administrator"],status:"active",createdAt:"",updatedAt:""};

describe("Phase C12 review recipients, evidence, and billing",()=>{
  it("persists a normalized manager email through User Management and repository re-instantiation",()=>{
    const storage=new MemoryStorage(),repository=new LocalUserRepository(storage);
    repository.createUser(admin,"password");
    const service=new UserManagementService(repository,{create:(user,password)=>repository.createUser(user,password)},()=>"manager",()=>"2026-08-03T00:00:00Z");
    service.create(admin,{username:"manager.review",displayName:"Manager Reviewer",email:" EquipmentDept.PSC@gmail.com ",systemRoles:["rental-operations"],initialPassword:"password"});
    expect(new LocalUserRepository(storage).getUserById("manager")?.email).toBe("equipmentdept.psc@gmail.com");
    expect(storage.get(AUTH_USERS_STORAGE_KEY)).not.toBeNull();
  });

  it("rejects invalid email and safely resolves missing, inactive, cross-tenant, and ambiguous reviewers",()=>{
    const storage=new MemoryStorage(),repository=new LocalUserRepository(storage);repository.createUser(admin,"password");
    const service=new UserManagementService(repository,{create:(user,password)=>repository.createUser(user,password)});
    expect(()=>service.create(admin,{username:"bad",displayName:"Bad",email:"bad\r\nBcc:x",systemRoles:["rental-operations"],initialPassword:"x"})).toThrow("valid application-user email");
    const reviewer=(id:string,companyId:string,status:User["status"]="active"):User=>({id,companyId,username:id,displayName:id,email:`${id}@example.test`,systemRoles:["rental-operations"],status,createdAt:"",updatedAt:""});
    expect(resolveManagerReviewer([],"TENANT-A")).toMatchObject({success:false,code:"MANAGER_REVIEWER_NOT_CONFIGURED"});
    expect(resolveManagerReviewer([reviewer("inactive","TENANT-A","inactive")],"TENANT-A")).toMatchObject({success:false,code:"MANAGER_REVIEWER_NOT_CONFIGURED"});
    expect(resolveManagerReviewer([reviewer("other","TENANT-B")],"TENANT-A")).toMatchObject({success:false,code:"MANAGER_REVIEWER_NOT_CONFIGURED"});
    expect(resolveManagerReviewer([reviewer("one","TENANT-A"),reviewer("two","TENANT-A")],"TENANT-A")).toMatchObject({success:false,code:"MULTIPLE_MANAGER_REVIEWERS"});
  });

  it("renders every closed activity interval in deterministic HTML/text and escapes evidence",()=>{
    const timeline=buildCustomerReviewTimeline([
      {id:"1",activityType:"operation",action:"start",timestamp:"2026-08-03T23:30:00+08:00",sequence:1,source:"user",workDescription:"Haul <rock>",remarks:"<script>x</script>",meterReading:10},
      {id:"2",activityType:"operation",action:"end",timestamp:"2026-08-04T00:30:30+08:00",sequence:2,source:"user",meterReading:11},
      {id:"3",activityType:"idle",action:"start",timestamp:"2026-08-04T00:31:00+08:00",sequence:3,source:"user"},
      {id:"4",activityType:"idle",action:"end",timestamp:"2026-08-04T00:41:00+08:00",sequence:4,source:"user"},
      {id:"5",activityType:"breakdown",action:"start",timestamp:"2026-08-04T00:42:00+08:00",sequence:5,source:"user"},
    ]);
    expect(timeline).toHaveLength(2);expect(timeline[0]).toMatchObject({activityType:"Operation",durationSeconds:3630,openingMeter:10,closingMeter:11});
    const email=renderNotificationTemplate("CUSTOMER_REVIEW_REQUESTED",{recipientName:"Customer",companyName:"PSC",rentalReference:"R-1",activityTimeline:timeline,activityTotals:{operationMinutes:61,idleMinutes:10,standbyMinutes:0,breakdownMinutes:0}});
    expect(email.text).toContain("2026-08-03T23:30:00+08:00");expect(email.text).toContain("3630 seconds");expect(email.html).toContain("Haul &lt;rock&gt;");expect(email.html).not.toContain("<script>");
  });

  it("separates operating, idle, and standby charges without inflating non-operation hours",()=>{
    const deur={id:"d",rentalId:"r",equipmentId:"e",operatorId:"o",workDate:"2026-08-03",logs:[],totalOperatingMinutes:60,totalIdleMinutes:30,totalStandbyMinutes:15,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,status:"Acknowledged",createdAt:"",updatedAt:""} satisfies DeurRecord;
    expect(BillingRateEngine.calculate(deur,{billingMethod:"Per Hour",unitRate:100,minimumBillableHours:4,standbyRate:20,operatorIncluded:true})).toMatchObject({operatingHours:4,idleHours:.5,standbyHours:.25,operatingCharge:400,idleCharge:10,standbyCharge:5,subtotal:415});
  });

  it("adds only a forward migration with narrow manager resolver grants",()=>{
    const sql=readFileSync("supabase/migrations/20260803004400_phase_c12_review_recipient_and_billing_evidence.sql","utf8");
    const resolver=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.resolve_manager_review_recipient"),sql.indexOf("CREATE OR REPLACE FUNCTION erp.enforce_customer_review_snapshot_recipient"));
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS email text");expect(resolver).toContain("SECURITY DEFINER");expect(resolver).toContain("SET search_path = erp, auth, pg_catalog");expect(resolver).toContain("TO service_role");expect(resolver).not.toMatch(/TO anon|TO authenticated/);
  });
});
