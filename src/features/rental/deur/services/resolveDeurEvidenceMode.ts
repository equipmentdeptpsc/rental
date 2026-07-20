import type { DeurEvidenceMode } from "../types";
export type ResolveDeurEvidenceModeResult={supported:true;mode:DeurEvidenceMode}|{supported:false;billingMethod:string};
const modes:Record<string,DeurEvidenceMode>={"Per Hour":"TIME_TIMELINE","Per Day":"TIME_TIMELINE","Per Week":"TIME_TIMELINE","Per Month":"TIME_TIMELINE","Per Kilometer":"ODOMETER_TRIP","Per Trip":"ODOMETER_TRIP","Per Cubic Meter":"QUANTITY","One Lot":"COMPLETION","Per Lot":"COMPLETION"};
export function resolveDeurEvidenceMode(billingMethod:unknown):ResolveDeurEvidenceModeResult{const value=typeof billingMethod==="string"?billingMethod:"";const mode=modes[value];return mode?{supported:true,mode}:{supported:false,billingMethod:value}}
