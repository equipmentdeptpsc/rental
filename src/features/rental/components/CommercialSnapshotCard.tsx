import type { RentalCommercialSnapshot } from "../types";
import { resolveCommercialSummary } from "../commercial/resolveCommercialSummary";
interface Props{snapshot?:RentalCommercialSnapshot;scope:"Rental"|"DEUR";required?:boolean}
const units:Record<string,string>={"Per Hour":"hour","Per Day":"day","Per Week":"week","Per Month":"month","Per Kilometer":"km","Per Trip":"trip","Per Cubic Meter":"m³"};
export default function CommercialSnapshotCard({snapshot,scope,required}:Props){
 if(!snapshot)return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{required?"Commercial snapshot not captured":"Commercial snapshot not captured for this legacy record"}</section>;
 const money=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:snapshot.currency}).format(value);
 const rows:Array<[string,string|undefined]>=[["Billing Method",snapshot.billingMethod],...resolveCommercialSummary(snapshot).map(row=>[row.label,row.kind==="hours"?`${row.value} hours`:`${money(row.value)}${["unitRate","standbyRate","overtimeRate"].includes(row.key)?` / ${units[snapshot.billingMethod]??"unit"}`:""}`] as [string,string]),["VAT",snapshot.taxRate!==undefined?`${snapshot.taxRate}%`:undefined],["Withholding Tax",snapshot.withholdingTax!==undefined?`${snapshot.withholdingTax}%`:undefined],["Commercial Terms Captured",new Date(snapshot.capturedAt).toLocaleString()]];
 return <section className="rounded-xl border bg-white p-5 shadow-sm"><h3 className="font-semibold">{scope} Commercial Terms</h3><p className="mt-1 text-xs text-slate-500">Immutable snapshot</p><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{rows.filter(([,value])=>value!==undefined).map(([label,value])=><div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
