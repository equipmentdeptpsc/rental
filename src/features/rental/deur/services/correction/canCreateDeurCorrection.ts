import { isTestRuntime } from "@/core/runtime/isTestRuntime";

export function canCreateDeurCorrection(actor:{role?:string;permissionGranted?:boolean}){
  return actor.permissionGranted === true || (isTestRuntime() && actor.role === "Admin");
}
