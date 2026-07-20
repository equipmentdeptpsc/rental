import { isRentalBillingMethod, type RentalCommercialSnapshot } from "../types";

type Source = Omit<RentalCommercialSnapshot,"capturedAt"|"billingMethod"|"currency"> & { billingMethod:unknown;currency?:unknown };
export type CreateRentalCommercialSnapshotResult={success:true;snapshot:RentalCommercialSnapshot}|{success:false;issues:Array<{code:string;message:string;field?:string}>};
const optional=["minimumBillableHours","overtimeRate","standbyRate","mobilizationFee","demobilizationFee","fuelCharge","operatorRate","taxRate","withholdingTax","contractAmount"] as const;

export function createRentalCommercialSnapshot(source:Source,capturedAt:string):CreateRentalCommercialSnapshotResult{
 const issues:Extract<CreateRentalCommercialSnapshotResult,{success:false}>["issues"]=[];
 if(!isRentalBillingMethod(source.billingMethod))issues.push({code:"INVALID_BILLING_METHOD",message:"A supported billing method is required.",field:"billingMethod"});
 if(!Number.isFinite(source.unitRate)||source.unitRate<0)issues.push({code:"COMMERCIAL_RATE_INVALID",message:"Unit rate must be a finite non-negative number.",field:"unitRate"});
 optional.forEach(field=>{const value=source[field];if(value!==undefined&&(!Number.isFinite(value)||value<0))issues.push({code:"COMMERCIAL_VALUE_INVALID",message:`${field} must be a finite non-negative number.`,field})});
 if(typeof source.operatorIncluded!=="boolean")issues.push({code:"OPERATOR_TERMS_INVALID",message:"Operator inclusion must be configured.",field:"operatorIncluded"});
 if(!Number.isFinite(Date.parse(capturedAt)))issues.push({code:"CAPTURED_AT_INVALID",message:"Commercial snapshot timestamp is invalid.",field:"capturedAt"});
 const currency=typeof source.currency==="string"?source.currency.trim().toUpperCase():"";if(!currency)issues.push({code:"CURRENCY_INVALID",message:"Currency is required.",field:"currency"});
 if(issues.length)return{success:false,issues};
 const snapshot:RentalCommercialSnapshot={billingMethod:source.billingMethod as RentalCommercialSnapshot["billingMethod"],unitRate:source.unitRate,operatorIncluded:source.operatorIncluded,currency,capturedAt:new Date(capturedAt).toISOString()};
 optional.forEach(field=>{if(source[field]!==undefined)(snapshot as unknown as Record<string,unknown>)[field]=source[field]});
 return{success:true,snapshot:structuredClone(snapshot)};
}

export function normalizeRentalCommercialSnapshot(value:unknown):RentalCommercialSnapshot|undefined{
 if(!value||typeof value!=="object")return;const item=value as Record<string,unknown>;
 const result=createRentalCommercialSnapshot(item as unknown as Source,String(item.capturedAt??""));
 return result.success?result.snapshot:undefined;
}
