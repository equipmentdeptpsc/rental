import type { RentalRecord } from "../types";

export default function ApprovalInvalidationNotice({rental}:{rental:RentalRecord}){
  const invalidated=[...(rental.approvalHistory??[])].reverse().find(event=>event.action==="Invalidated");
  const resubmitted=invalidated&&(rental.approvalHistory??[]).some(event=>event.timestamp>invalidated.timestamp&&["Submitted","Resubmitted","Approved"].includes(event.action));
  if(!invalidated||resubmitted)return null;
  return <section className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-semibold">Approval required again</h3><p className="mt-1">The previous Manager approval was invalidated because {invalidated.remarks??"material Rental details were changed"}. The previous approval remains historical and no longer authorizes release.</p><p className="mt-2">Changed by: {invalidated.actor?.name??"Actor unavailable"}<br/>Changed at: {new Date(invalidated.timestamp).toLocaleString()}</p><p className="mt-2">Review the changes before sending a new approval request.</p></section>;
}
