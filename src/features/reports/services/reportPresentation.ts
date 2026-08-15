import type {ReportMetric} from "./reportBuilderService";
import type {CustomReportSection} from "./customReportWorkspace";

export const reportTheme=Object.freeze({primary:"#0865d9",navy:"#0f2346",text:"#17233b",muted:"#64748b",border:"#dbe4ef",surface:"#f8fafc",success:"#16a34a",warning:"#f59e0b",danger:"#ef4444",purple:"#7c3aed",previous:"#94a3b8"});
export type ReportAccent="blue"|"green"|"purple"|"red"|"orange";
export interface ReportMetricPresentation{metric:ReportMetric;accent:ReportAccent;symbol:string}
export interface ModernReportSection{id:string;reportType:CustomReportSection["type"];title:string;metrics:ReportMetricPresentation[];utilization?:number;columns:string[];rows:(string|number)[][]}
export interface ModernReportViewModel{executiveMetrics:ReportMetricPresentation[];sections:ModernReportSection[]}

export function metricPresentation(metric:ReportMetric):ReportMetricPresentation{const label=metric.label.toLowerCase();if(/cancel|outstanding|exception|overdue/.test(label))return{metric,accent:"red",symbol:"!"};if(/active|available|collected/.test(label))return{metric,accent:"green",symbol:"+"};if(/closed|completed|deployed/.test(label))return{metric,accent:"purple",symbol:"C"};if(/assigned|maintenance|scheduled/.test(label))return{metric,accent:"orange",symbol:"A"};return{metric,accent:"blue",symbol:"#"}}
export function buildModernReportViewModel(sections:readonly CustomReportSection[]):ModernReportViewModel{const seen=new Set<string>(),executiveMetrics:ReportMetricPresentation[]=[];for(const section of sections)for(const metric of section.report.metrics){if(!seen.has(metric.label)&&executiveMetrics.length<7){seen.add(metric.label);executiveMetrics.push(metricPresentation(metric))}}return{executiveMetrics,sections:sections.map(section=>({id:section.id,reportType:section.type,title:section.report.title,metrics:section.report.metrics.map(metricPresentation),utilization:section.type==="equipment"?clampUtilization(section.report.metrics.find(metric=>/utilization/i.test(metric.label))?.numericValue):undefined,columns:[...section.report.columns],rows:[...section.report.rows]}))}}
export function clampUtilization(value:number|undefined):number{return Math.min(100,Math.max(0,Number.isFinite(value)?value!:0))}
export function compactChartMaximum(metrics:readonly ReportMetricPresentation[]):number{return Math.max(1,...metrics.flatMap(({metric})=>[Math.abs(metric.numericValue??0),Math.abs(metric.previousValue??0)]))}
