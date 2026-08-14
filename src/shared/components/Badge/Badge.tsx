import type { ReactNode } from "react";
type Tone="neutral"|"info"|"success"|"warning"|"danger";
const tones:Record<Tone,string>={neutral:"border-slate-300 bg-slate-100 text-slate-700",info:"border-blue-200 bg-blue-50 text-blue-800",success:"border-emerald-200 bg-emerald-50 text-emerald-800",warning:"border-amber-200 bg-amber-50 text-amber-900",danger:"border-red-200 bg-red-50 text-red-800"};
export default function Badge({children,tone="neutral",className=""}:{children?:ReactNode;tone?:Tone;className?:string}){return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>}
