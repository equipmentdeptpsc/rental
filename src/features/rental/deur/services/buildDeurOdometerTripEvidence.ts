import type { DeurOdometerCheckpoint,DeurOdometerTripEvidence,DeurTripSegment } from "../types";
type Result={success:true;evidence:DeurOdometerTripEvidence}|{success:false;issues:string[]};
const precision=(value:number)=>Math.round((value+Number.EPSILON)*1000)/1000;
export function buildDeurOdometerTripEvidence(checkpoints:DeurOdometerCheckpoint[]):Result{
 const items=structuredClone(checkpoints),issues:string[]=[];
 if(items.length<2)issues.push("At least two checkpoints are required.");
 items.forEach((item,index)=>{item.location=typeof item.location==="string"?item.location.trim():"";if(!item.location)issues.push(`Checkpoint ${index+1} location is required.`);if(!Number.isFinite(item.odometerReading))issues.push(`Checkpoint ${index+1} requires a finite odometer reading.`);else if(item.odometerReading<0)issues.push(`Checkpoint ${index+1} odometer must be non-negative.`);if(item.recordedAt&&!Number.isFinite(Date.parse(item.recordedAt)))issues.push(`Checkpoint ${index+1} timestamp is invalid.`);if(item.remarks)item.remarks=item.remarks.trim()||undefined});
 for(let i=1;i<items.length;i++){if(items[i].odometerReading<items[i-1].odometerReading)issues.push("A later odometer reading cannot be lower.");else if(items[i].odometerReading===items[i-1].odometerReading)issues.push("Each completed checkpoint reading must be greater than the preceding reading.");if(items[i].recordedAt&&items[i-1].recordedAt&&Date.parse(items[i].recordedAt!)<Date.parse(items[i-1].recordedAt!))issues.push("A later checkpoint timestamp cannot precede the previous timestamp.")}
 if(issues.length)return{success:false,issues};
 const segments:DeurTripSegment[]=items.slice(1).map((end,index)=>{const start=items[index];return{id:`segment-${start.id}-${end.id}`,startCheckpointId:start.id,endCheckpointId:end.id,startLocation:start.location,endLocation:end.location,...(start.recordedAt?{departureAt:start.recordedAt}:{}),...(end.recordedAt?{arrivalAt:end.recordedAt}:{}),startOdometer:start.odometerReading,endOdometer:end.odometerReading,distance:precision(end.odometerReading-start.odometerReading),...(end.remarks?{remarks:end.remarks}:{})}});
 return{success:true,evidence:{checkpoints:items,segments,startingOdometer:items[0].odometerReading,endingOdometer:items.at(-1)!.odometerReading,totalDistance:precision(segments.reduce((sum,item)=>sum+item.distance,0)),tripCount:segments.length}};
}
