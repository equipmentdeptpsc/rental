import { repositoryFailure } from "@/core/persistence";
import { createRemoteCapabilities,createRemoteCore,readRemoteConfiguration,validateSupabaseConfiguration,type RemoteRuntimeConfiguration } from "@/core/remote";
import { getSupabaseBrowserClient } from "@/integrations/supabase/browserClient";
import { SupabaseEquipmentStatusReadRepository,type ReadOnlyEquipmentStatusRepository } from "@/features/masters/equipment-status/repository";
import type { ApplicationDependencies,ApplicationDependencyOverrides,EquipmentStatusSource } from "./ApplicationDependencies";
import { createLocalApplicationDependencies } from "./createLocalApplicationDependencies";

export interface ApplicationRuntimeConfiguration { equipmentStatusSource?:string;supabaseUrl?:string;supabasePublishableKey?:string }
class MissingRemoteConfigurationRepository implements ReadOnlyEquipmentStatusRepository{
  readonly capabilities=createRemoteCapabilities("ReadOnly","SupportsPaging","SupportsOrdering");
  private failure(){return repositoryFailure("SUPABASE_CONFIGURATION_MISSING","Supabase Equipment Status mode requires browser-safe project configuration.",{context:{repository:"EquipmentStatus",required:"VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY"},recoverability:"USER_ACTION_REQUIRED",recommendedAction:"Provide the Vite Supabase URL and publishable key, or set VITE_EQUIPMENT_STATUS_SOURCE=local."});}
  async list(){return this.failure();}async getById(){return this.failure();}
}
export function readApplicationRuntimeConfiguration():ApplicationRuntimeConfiguration{const value=readRemoteConfiguration({VITE_SUPABASE_URL:import.meta.env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},import.meta.env.VITE_EQUIPMENT_STATUS_SOURCE);return{equipmentStatusSource:value.source,supabaseUrl:value.supabaseUrl,supabasePublishableKey:value.supabasePublishableKey};}
export function createApplicationDependencies(configuration:ApplicationRuntimeConfiguration=readApplicationRuntimeConfiguration(),overrides:ApplicationDependencyOverrides={}):ApplicationDependencies{
  const source:EquipmentStatusSource=configuration.equipmentStatusSource==="supabase"?"supabase":"local";
  if(source==="local")return createLocalApplicationDependencies(overrides);
  const remoteConfiguration:RemoteRuntimeConfiguration={source:"supabase",supabaseUrl:configuration.supabaseUrl,supabasePublishableKey:configuration.supabasePublishableKey};
  const validated=validateSupabaseConfiguration(remoteConfiguration);const remoteCore=createRemoteCore();
  const equipmentStatusRead=validated.success?new SupabaseEquipmentStatusReadRepository(getSupabaseBrowserClient(validated.value),remoteCore):new MissingRemoteConfigurationRepository();
  const dependencies=createLocalApplicationDependencies({...overrides,repositories:{...overrides.repositories,equipmentStatusRead}});
  return{...dependencies,configuration:{equipmentStatusSource:"supabase"}};
}
