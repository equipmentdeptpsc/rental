import { organizationBranding } from "./organizationBranding";

export default function OrganizationBrand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={organizationBranding.logoAssetPath}
        alt={organizationBranding.logoAltText}
        className={`${compact ? "h-8 w-[76px]" : "h-10 w-[95px] sm:h-12 sm:w-[114px]"} shrink-0 object-contain`}
      />
      <div className={`min-w-0 leading-tight ${inverse ? "text-white" : "text-slate-900"}`}>
        <div className={`${compact ? "text-[10px]" : "text-[10px] sm:text-xs"} truncate font-bold uppercase tracking-wide`}>
          {organizationBranding.companyName}
        </div>
        <div className={`${compact ? "text-[10px]" : "text-xs"} ${inverse ? "text-slate-300" : "text-slate-600"}`}>
          {organizationBranding.departmentName}
        </div>
        {!compact && <div className="mt-0.5 hidden text-sm font-semibold sm:block">{organizationBranding.systemName}</div>}
      </div>
    </div>
  );
}
