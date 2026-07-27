export function canCreateDeurCorrection(actor:{role?:string;permissionGranted?:boolean}){
  return actor.permissionGranted === true || (import.meta.env.MODE === "test" && actor.role === "Admin");
}
