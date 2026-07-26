import type { DeurRecord } from "../../deur/types";
import type { BillingCalculationTerms } from "./BillingCalculationTerms";

export type CommercialTermsSource="IMMUTABLE_SNAPSHOT"|"LEGACY_RENTAL_FALLBACK";
export function resolveDeurBillingCalculationTerms(deur:DeurRecord,fallbackTerms:BillingCalculationTerms):{terms:BillingCalculationTerms;source:CommercialTermsSource;capturedAt?:string}{
 const snapshot=deur.commercialSnapshot;
 if(!snapshot)return{terms:structuredClone(fallbackTerms),source:"LEGACY_RENTAL_FALLBACK"};
 return{terms:{billingMethod:snapshot.billingMethod,unitRate:snapshot.unitRate,minimumBillableHours:snapshot.minimumBillableHours,overtimeRate:snapshot.overtimeRate,standbyRate:snapshot.standbyRate,mobilizationFee:snapshot.mobilizationFee,demobilizationFee:snapshot.demobilizationFee,fuelCharge:snapshot.fuelCharge,operatorIncluded:snapshot.operatorIncluded,operatorRate:snapshot.operatorRate,taxRate:snapshot.taxRate,withholdingTax:snapshot.withholdingTax,contractAmount:snapshot.contractAmount},source:"IMMUTABLE_SNAPSHOT",capturedAt:snapshot.capturedAt};
}
