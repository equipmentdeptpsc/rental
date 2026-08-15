import type {BuiltReport,ReportMetric} from "./reportBuilderService";
import type {CustomReportSection} from "./customReportWorkspace";
import type {ExecutiveAnalysisRecord} from "./executiveReportAnalysis";

export type ReportReviewMode="executive"|"technical";
export type ReportViewMode="continuous"|"pages";
export type ReportFit="width"|"page"|"100";
export type ReportBlockKind="executive-summary"|"kpi-grid"|"comparison-chart"|"summary-table"|"detail-table";
export interface ReportBlock{ id:string;kind:ReportBlockKind;title:string;sectionId?:string;metrics?:ReportMetric[];columns?:string[];rows?:BuiltReport["rows"];keepTogether:boolean;estimatedHeight:number }
export interface ComposedReport{name:string;mode:ReportReviewMode;sections:readonly CustomReportSection[];blocks:ReportBlock[];period:string;comparisonPeriod?:string}
export interface ReportPreviewSnapshot{name:string;sections:CustomReportSection[];analysis?:ExecutiveAnalysisRecord}
let previewSnapshot:ReportPreviewSnapshot|null=null;

const estimateTable=(rows:number)=>28+Math.min(rows,8)*18;
export function composeCustomReport(name:string,sections:readonly CustomReportSection[],mode:ReportReviewMode):ComposedReport{
 const blocks:ReportBlock[]=[];
 if(mode==="executive")blocks.push({id:"executive-summary",kind:"executive-summary",title:"Executive Summary",metrics:sections.flatMap(x=>x.report.metrics).slice(0,8),keepTogether:true,estimatedHeight:110});
 sections.forEach(section=>{const report=section.report;blocks.push({id:`${section.id}-kpi`,sectionId:section.id,kind:"kpi-grid",title:report.title,metrics:report.metrics,keepTogether:true,estimatedHeight:70+Math.ceil(report.metrics.length/4)*44});const chartable=report.metrics.filter(x=>x.numericValue!==undefined);if(chartable.length)blocks.push({id:`${section.id}-chart`,sectionId:section.id,kind:"comparison-chart",title:`${report.title} Comparison`,metrics:chartable.slice(0,6),keepTogether:true,estimatedHeight:150});if(mode==="technical"&&report.rows.length)blocks.push({id:`${section.id}-table`,sectionId:section.id,kind:"detail-table",title:`${report.title} Details`,columns:report.columns,rows:report.rows,keepTogether:false,estimatedHeight:estimateTable(report.rows.length)});else if(mode==="executive"&&report.rows.length)blocks.push({id:`${section.id}-summary`,sectionId:section.id,kind:"summary-table",title:`${report.title} Highlights`,columns:report.columns,rows:report.rows.slice(0,5),keepTogether:true,estimatedHeight:estimateTable(Math.min(report.rows.length,5))})});
 const first=sections[0]?.config.period;return{name,mode,sections,blocks,period:first?`${first.startDate} to ${first.endDate}`:"No reporting period",comparisonPeriod:first?.comparisonStartDate?`${first.comparisonStartDate} to ${first.comparisonEndDate}`:undefined};
}

export interface LayoutPage{number:number;blockIds:string[];usedHeight:number}
export function paginateReportBlocks(blocks:readonly ReportBlock[],usableHeight=500):LayoutPage[]{const pages:LayoutPage[]=[{number:1,blockIds:[],usedHeight:0}];for(const block of blocks){let page=pages.at(-1)!;if(block.keepTogether&&page.usedHeight>0&&page.usedHeight+block.estimatedHeight>usableHeight){page={number:pages.length+1,blockIds:[],usedHeight:0};pages.push(page)}page.blockIds.push(block.id);page.usedHeight+=block.estimatedHeight;if(!block.keepTogether&&page.usedHeight>usableHeight){const overflow=page.usedHeight-usableHeight;page.usedHeight=usableHeight;while(overflow-(pages.length-page.number)*usableHeight>0)pages.push({number:pages.length+1,blockIds:[block.id],usedHeight:Math.min(usableHeight,overflow-(pages.length-page.number-1)*usableHeight)})}}return pages}

export function saveReportPreview(name:string,sections:readonly CustomReportSection[]){previewSnapshot={name,sections:[...structuredClone(sections)],analysis:previewSnapshot?.analysis}}
export function savePreviewAnalysis(analysis:ExecutiveAnalysisRecord){if(!previewSnapshot)throw new Error("No Custom Report preview is active.");previewSnapshot={...previewSnapshot,analysis:structuredClone(analysis)}}
export function setPreviewAnalysisIncluded(included:boolean){if(!previewSnapshot?.analysis)return;previewSnapshot={...previewSnapshot,analysis:{...previewSnapshot.analysis,included}}}
export function loadReportPreview():ReportPreviewSnapshot|null{return previewSnapshot?structuredClone(previewSnapshot):null}
