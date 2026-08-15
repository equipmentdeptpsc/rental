import type {BuiltReport} from "./reportBuilderService";
export type ReportActionState="idle"|"running"|"ready"|"exporting-data"|"exporting-pdf"|"exporting-custom"|"error";
export function reportExportAvailability(report:BuiltReport|null){return{data:Boolean(report?.rows.length),pdf:Boolean(report&&(report.rows.length||report.metrics.length))}}
export function settleReportAction(current:ReportActionState,exporting:ReportActionState):ReportActionState{return current===exporting?"ready":current}
