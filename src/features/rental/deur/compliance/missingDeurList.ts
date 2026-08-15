export type MissingDeurStatus = "Missing" | "Incomplete" | "Pending Correction" | "Acknowledged";
export interface MissingDeurListItem { id:string; rental:string; workDate:string; equipment:string; operator:string; project:string; shift:string; status:MissingDeurStatus; reason:string; searchText:string }
export interface MissingDeurListFilter { query:string; status:"All"|MissingDeurStatus; from:string; to:string; operator:string; equipment:string; rental:string; project:string }

export function filterMissingDeurItems<T extends MissingDeurListItem>(items:readonly T[],filter:MissingDeurListFilter):T[]{
 const q=filter.query.trim().toLowerCase();
 return items.filter(item=>filter.status==="All"||item.status===filter.status)
  .filter(item=>!filter.from||item.workDate>=filter.from).filter(item=>!filter.to||item.workDate<=filter.to)
  .filter(item=>!filter.operator||item.operator===filter.operator).filter(item=>!filter.equipment||item.equipment===filter.equipment)
  .filter(item=>!filter.rental||item.rental===filter.rental).filter(item=>!filter.project||item.project===filter.project)
  .filter(item=>!q||`${item.rental} ${item.workDate} ${item.equipment} ${item.operator} ${item.project} ${item.shift} ${item.status} ${item.reason} ${item.searchText}`.toLowerCase().includes(q))
  .sort((a,b)=>b.workDate.localeCompare(a.workDate)||a.rental.localeCompare(b.rental)||a.id.localeCompare(b.id));
}

export function missingDeurCounts(items:readonly MissingDeurListItem[]){return{All:items.length,Missing:items.filter(x=>x.status==="Missing").length,Incomplete:items.filter(x=>x.status==="Incomplete").length,"Pending Correction":items.filter(x=>x.status==="Pending Correction").length,Acknowledged:items.filter(x=>x.status==="Acknowledged").length}}
