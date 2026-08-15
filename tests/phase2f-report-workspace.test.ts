import {describe,expect,it} from "vitest";
import {addCustomReportSection,defaultCustomReportName,moveCustomReportSection,removeCustomReportSection} from "@/features/reports/services/customReportWorkspace";
import {buildComparisonChartData,formatMetricChange,type BuiltReport,type ReportBuilderConfig} from "@/features/reports/services/reportBuilderService";
import {resolveReportPeriod} from "@/features/reports/services/reportPeriod";
import {reportExportAvailability,settleReportAction} from "@/features/reports/services/reportWorkspaceState";

const report=(rows:BuiltReport["rows"]=[]):BuiltReport=>({title:"Equipment Report",period:"Aug 1 - Aug 14, 2026",filters:[],columns:["Code"],rows,metrics:[{label:"Utilization Rate",value:"50%",numericValue:50,previousValue:40,variance:10,variancePercent:25}],groupBy:"none"});
const config:ReportBuilderConfig={type:"equipment",period:resolveReportPeriod({preset:"THIS_MONTH",now:new Date(2026,7,14)}),groupBy:"none"};
const section=(id:string)=>({id,type:"equipment" as const,config,report:report([[id]]),addedAt:`2026-08-14T00:00:0${id}.000Z`});

describe("Phase 2F report workspace",()=>{
 it("keeps PDF available for a KPI-only result while data export requires rows",()=>{expect(reportExportAvailability(report())).toEqual({data:false,pdf:true});expect(reportExportAvailability(report([["ME-1"]]))).toEqual({data:true,pdf:true});expect(reportExportAvailability(null)).toEqual({data:false,pdf:false})});
 it("settles only the matching export state",()=>{expect(settleReportAction("exporting-data","exporting-data")).toBe("ready");expect(settleReportAction("error","exporting-data")).toBe("error")});
 it("detects duplicates and preserves deliberate duplicate additions",()=>{const first=addCustomReportSection([],section("1"));const blocked=addCustomReportSection(first.sections,section("2"));expect(blocked.duplicate).toBe(true);expect(blocked.sections).toHaveLength(1);expect(addCustomReportSection(first.sections,section("2"),true).sections).toHaveLength(2)});
 it("reorders and removes sections deterministically",()=>{const one=addCustomReportSection([],section("1"),true).sections;const two=addCustomReportSection(one,section("2"),true).sections;expect(moveCustomReportSection(two,"2",-1).map(x=>x.id)).toEqual(["2","1"]);expect(removeCustomReportSection(two,"1").map(x=>x.id)).toEqual(["2"])});
 it("builds comparison chart data and labels percentage-point changes",()=>{expect(buildComparisonChartData(report())).toEqual([{name:"Utilization Rate",Current:50,Previous:40}]);expect(formatMetricChange(report().metrics[0])).toBe("+10 pts")});
 it("provides a deterministic dated default name and previous-week range",()=>{expect(defaultCustomReportName(new Date(2026,7,14))).toContain("Aug 14, 2026");expect(resolveReportPeriod({preset:"LAST_WEEK",now:new Date(2026,7,14)})).toMatchObject({startDate:"2026-08-03",endDate:"2026-08-09"})});
});
