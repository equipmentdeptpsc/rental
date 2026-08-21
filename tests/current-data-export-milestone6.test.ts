import {describe,expect,it,vi} from "vitest";
import type {ApplicationReadRepositories} from "@/app/composition/ApplicationDependencies";
import {loadAuthorizedCurrentMasterData} from "@/features/data-migration/currentDataExport";
const result=(items:unknown[])=>({list:vi.fn().mockResolvedValue({success:true,value:{items,total:items.length}})});
describe("controlled current-data export",()=>{
 it("rejects callers without master-data permission before repository reads",async()=>{const repositories=new Proxy({},{get:()=>result([])}) as ApplicationReadRepositories;await expect(loadAuthorizedCurrentMasterData(repositories,false)).rejects.toThrow("masterData.manage")});
 it("exports exactly the active read-repository tenant scope, including empty sets",async()=>{const equipment=[{id:"tenant-equipment"}],repositories={equipment:result(equipment),operators:result([]),customers:result([]),projects:result([])} as unknown as ApplicationReadRepositories;const exported=await loadAuthorizedCurrentMasterData(repositories,true);expect(exported.equipment).toEqual(equipment);expect(exported.operators).toEqual([]);expect(repositories.equipment.list).toHaveBeenCalledOnce()});
});
