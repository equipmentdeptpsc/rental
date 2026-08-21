import type { ApplicationReadRepositories } from "@/app/composition/ApplicationDependencies";
import type { CustomerRecord } from "@/features/customer/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";

export interface CurrentMasterData { equipment:EquipmentRecord[];operators:Operator[];customers:CustomerRecord[];projects:ProjectRecord[] }

export async function loadAuthorizedCurrentMasterData(repositories:ApplicationReadRepositories,canManageMasterData:boolean):Promise<CurrentMasterData>{
  if(!canManageMasterData)throw new Error("Current-data export requires masterData.manage permission.");
  const results=await Promise.all([repositories.equipment.list(),repositories.operators.list(),repositories.customers.list(),repositories.projects.list()]);
  const failed=results.find(result=>!result.success);if(failed&&!failed.success)throw new Error(failed.error.message);
  return{equipment:results[0].success?results[0].value.items:[],operators:results[1].success?results[1].value.items:[],customers:results[2].success?results[2].value.items:[],projects:results[3].success?results[3].value.items:[]};
}
