import type {
  BillingInvoiceStatus,
  BillingStatement,
} from "@/features/rental/billingstatement/types";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { useState } from "react";

interface Props {
  drafts: BillingStatement[];
  onDelete(id: string): void;
  onInvoiceStatus(id: string, status: BillingInvoiceStatus): void;
  onCollect(id: string, input: { mode: "partial" | "full"; amount?: number; paymentDate: string; referenceNumber: string; paymentMethod?: string; remarks?: string }): unknown;
  selectedId?: string;
}

export default function BillingDraftTable({
  drafts,
  onDelete,
  onInvoiceStatus,
  onCollect,
  selectedId,
}: Props) {
  const [collecting,setCollecting]=useState<{id:string;mode:"partial"|"full"}>();
  const [amount,setAmount]=useState("");const [paymentDate,setPaymentDate]=useState(new Date().toISOString().slice(0,10));const [referenceNumber,setReferenceNumber]=useState("");const [paymentMethod,setPaymentMethod]=useState("");const [remarks,setRemarks]=useState("");
  const submitCollection=()=>{if(!collecting)return;const result=onCollect(collecting.id,{mode:collecting.mode,amount:collecting.mode==="partial"?Number(amount):undefined,paymentDate,referenceNumber,paymentMethod,remarks}) as {success?:boolean}|undefined;if(result?.success){setCollecting(undefined);setAmount("");setReferenceNumber("");setPaymentMethod("");setRemarks("")}};
  if (drafts.length === 0) {
    return <div className="rounded-xl border bg-white p-6 text-center text-slate-500">No Billing Statements found.</div>;
  }

  return (
    <ResponsiveTable><div className="rounded-xl border bg-white min-w-max">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-4 py-3 text-left">Billing No.</th>
            <th className="px-4 py-3 text-left">Customer</th>
            <th className="px-4 py-3 text-left">Project</th>
            <th className="px-4 py-3 text-center">Period</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-center">Equipment / DEUR rows</th>
            <th className="px-4 py-3 text-center">Approval</th>
            <th className="px-4 py-3 text-center">Invoice</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <tr key={draft.id} className={`border-t ${draft.id === selectedId ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : ""}`} data-selected={draft.id === selectedId || undefined}>
              <td className="px-4 py-3">{draft.statementNo}</td>
              <td className="px-4 py-3">{draft.customer}</td>
              <td className="px-4 py-3">{draft.project}</td>
              <td className="px-4 py-3 text-center">{draft.billingFrom} - {draft.billingTo}</td>
              <td className="px-4 py-3 text-right">{draft.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td className="px-4 py-3 text-center">{draft.lines.length}</td>
              <td className="px-4 py-3 text-center">{draft.approvalStatus}</td>
              <td className="px-4 py-3 text-center">{draft.invoiceStatus}</td>
              <td className="px-4 py-3 text-center">
                <div className="flex flex-wrap justify-center gap-2">
                  {draft.invoiceStatus === "Not Invoiced" && (
                    <button onClick={() => onInvoiceStatus(draft.id, "Invoiced")} className="rounded border px-2 py-1 text-xs">Mark Invoiced</button>
                  )}
                  {draft.invoiceStatus === "Invoiced" && (
                    <>
                      <button onClick={() => setCollecting({id:draft.id,mode:"partial"})} className="rounded border px-2 py-1 text-xs">Partially Collected</button>
                      <button onClick={() => setCollecting({id:draft.id,mode:"full"})} className="rounded border px-2 py-1 text-xs">Fully Collected</button>
                    </>
                  )}
                  {draft.invoiceStatus === "Partially Collected" && (
                    <button onClick={() => setCollecting({id:draft.id,mode:"full"})} className="rounded border px-2 py-1 text-xs">Fully Collected</button>
                  )}
                  <button onClick={() => onDelete(draft.id)} className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {collecting&&<section className="m-4 space-y-3 rounded border bg-slate-50 p-4"><h3 className="font-semibold">{collecting.mode==="partial"?"Record Partial Collection":"Collect Remaining Balance"}</h3>{collecting.mode==="partial"&&<label className="block text-sm">Amount Collected<input className="mt-1 w-full rounded border p-2" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></label>}<label className="block text-sm">Payment Date<input className="mt-1 w-full rounded border p-2" type="date" value={paymentDate} onChange={event=>setPaymentDate(event.target.value)}/></label><label className="block text-sm">Payment Reference Number<input className="mt-1 w-full rounded border p-2" value={referenceNumber} onChange={event=>setReferenceNumber(event.target.value)}/></label><label className="block text-sm">Payment Method (optional)<input className="mt-1 w-full rounded border p-2" value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value)}/></label><label className="block text-sm">Remarks (optional)<textarea className="mt-1 w-full rounded border p-2" value={remarks} onChange={event=>setRemarks(event.target.value)}/></label><div className="flex gap-2"><button className="rounded bg-blue-700 px-3 py-2 text-white" onClick={submitCollection}>Save Collection</button><button className="rounded border px-3 py-2" onClick={()=>setCollecting(undefined)}>Cancel</button></div></section>}
    </div></ResponsiveTable>
  );
}
