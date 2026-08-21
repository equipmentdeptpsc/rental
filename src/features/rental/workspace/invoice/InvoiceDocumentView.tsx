import { useMemo, useRef, useState } from "react";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { generateBillingStatementPdf } from "@/features/rental/billing-email/generateBillingStatementPdf";
import { SupabaseBillingStatementEmailCommandRepository, type BillingStatementEmailCommandRepository } from "@/features/rental/billing-email/BillingStatementEmailCommandRepository";
import { getSupabaseBrowserClient } from "@/integrations/supabase/browserClient";
import { useOptionalAuth } from "@/features/auth/AuthContext";
import { formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import { organizationBranding } from "@/shared/branding/organizationBranding";
import type { InvoiceDocument } from "./InvoiceDocumentBuilder";

const money = (value: number, currency: string) => currency === "PHP"
  ? formatPhpCurrency(value)
  : new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function InvoiceDocumentView({ document, emailRepository }: { document: InvoiceDocument; emailRepository?: BillingStatementEmailCommandRepository }) {
  const auth = useOptionalAuth(); const pendingRef=useRef(false); const commandRef=useRef<{commandId:string;idempotencyKey:string}|undefined>(undefined); const [sending,setSending]=useState(false); const [message,setMessage]=useState("");
  const trustedEmail=useMemo(()=>emailRepository??(()=>{const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;return url&&key?new SupabaseBillingStatementEmailCommandRepository(getSupabaseBrowserClient({url,publishableKey:key})):undefined;})(),[emailRepository]);
  const downloadPdf = async () => {
    const logoResponse = await fetch(organizationBranding.logoAssetPath);
    const logoBytes = logoResponse.ok ? new Uint8Array(await logoResponse.arrayBuffer()) : undefined;
    const pdf = generateBillingStatementPdf(document, undefined, logoBytes);
    const blob = new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `Billing-Statement-${document.statementNo}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const sendEmail=async()=>{if(!trustedEmail||pendingRef.current)return;pendingRef.current=true;setSending(true);setMessage("");const identity=commandRef.current??={commandId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};const result=await trustedEmail.enqueue({statementId:document.billingStatementId,expectedVersion:document.statementVersion,...identity});pendingRef.current=false;setSending(false);setMessage(result.success?"Billing Statement queued for email delivery.":result.message||"Unable to queue Billing Statement email.");};

  return <article className="invoice-document rounded-xl border bg-white p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="flex items-center gap-4">
        <img className="h-14 w-[133px] object-contain" src={organizationBranding.logoAssetPath} alt={organizationBranding.logoAltText}/>
        <div><p className="font-bold uppercase">{organizationBranding.companyName}</p><p className="text-sm text-slate-600">{organizationBranding.departmentName}</p><h2 className="mt-1 text-xl font-bold">Billing Statement</h2></div>
      </div>
      <div className="text-right text-sm"><b>{document.statementNo}</b><p>{document.status}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="print:hidden rounded border px-3 py-2" onClick={()=>window.print()}>Print</button><button type="button" className="print:hidden rounded border px-3 py-2" onClick={()=>void downloadPdf()}>Download PDF</button>{(!auth||auth.hasPermission("billing.update"))&&<button type="button" disabled={sending||!trustedEmail} className="print:hidden rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" onClick={()=>void sendEmail()}>{sending?"Sending...":"Send Billing Statement"}</button>}</div></div>
    </header>
    <section className="mt-4 grid gap-2 rounded border bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <p><b>Rental:</b> {document.rentalNumber}</p><p><b>Billing period:</b> {document.billingFrom} to {document.billingTo}</p><p><b>Statement date:</b> {document.statementDate.slice(0,10)}</p>
      <p><b>Customer:</b> {document.customer}</p><p><b>Representative:</b> {document.customerRepresentativeName ?? "Not provided"}</p><p><b>Email:</b> {document.customerRepresentativeEmail ?? "Not provided"}</p>
      <p><b>Project:</b> {document.project}</p>
    </section>
    {message&&<p role="status" className="mt-4 rounded border bg-blue-50 p-3 text-sm">{message}</p>}
    {document.warnings.length>0&&<div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><div className="font-semibold">Reconciliation / historical warnings</div><ul className="mt-1 list-disc pl-5">{document.warnings.map((warning,index)=><li key={`${warning.code}-${warning.lineId??index}`}>{warning.message}</li>)}</ul></div>}
    <ResponsiveTable><table className="mt-6 min-w-full text-sm"><thead className="bg-slate-100"><tr>{["DEUR No.","Date","Equipment","Service / Activity","Qty / Hours","Rate","Amount"].map(heading=><th key={heading} className={`px-4 py-3 ${["Qty / Hours","Rate","Amount"].includes(heading)?"text-right":"text-left"}`}>{heading}</th>)}</tr></thead><tbody>{document.serviceLines.map(line=><tr key={line.key} className="border-t align-top"><td className="px-4 py-4 font-medium">{line.deurReference}</td><td className="px-4 py-4">{line.workDate}</td><td className="max-w-56 whitespace-normal px-4 py-4">{line.equipmentLabel}<br/><span className="text-xs text-slate-500">{line.operatorLabel}</span></td><td className="max-w-64 whitespace-normal px-4 py-4">{line.service}</td><td className="px-4 py-4 text-right tabular-nums">{line.quantityLabel}</td><td className="px-4 py-4 text-right tabular-nums">{line.rate===undefined?"—":money(line.rate,document.currency)}</td><td className="px-4 py-4 text-right font-semibold tabular-nums">{money(line.amount,document.currency)}</td></tr>)}</tbody></table></ResponsiveTable>
    <dl className="ml-auto mt-6 grid max-w-md grid-cols-2 gap-x-8 gap-y-3 rounded-xl border bg-slate-50 p-5 text-sm"><dt>Subtotal</dt><dd className="text-right">{money(document.subtotal,document.currency)}</dd>{document.vatApplicable&&<><dt>VAT</dt><dd className="text-right">{money(document.vat??0,document.currency)}</dd></>}{document.withholdingTaxApplicable&&<><dt>Withholding tax</dt><dd className="text-right">({money(document.withholdingTax??0,document.currency)})</dd></>}<dt className="border-t pt-3 font-bold">Total amount</dt><dd className="border-t pt-3 text-right font-bold">{money(document.grandTotal,document.currency)}</dd>{document.amountCollected!==undefined&&<><dt>Collected</dt><dd className="text-right">{money(document.amountCollected,document.currency)}</dd></>}{document.outstandingBalance!==undefined&&<><dt className="border-t-2 border-slate-800 pt-4 text-base font-bold">{document.outstandingBalance===0?"PAID IN FULL":"OUTSTANDING AMOUNT"}</dt><dd className="border-t-2 border-slate-800 pt-4 text-right text-2xl font-black">{money(document.outstandingBalance,document.currency)}</dd></>}</dl>
    <footer className="mt-6 border-t pt-3 text-center text-xs text-slate-500">{organizationBranding.documentFooter}<br/>{organizationBranding.systemName}</footer>
  </article>;
}
