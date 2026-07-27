import { useState } from "react";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { buildBillingStatementEmail } from "@/features/rental/billing-email/buildBillingStatementEmail";
import { generateBillingStatementPdf } from "@/features/rental/billing-email/generateBillingStatementPdf";
import { formatOperationalHours, formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import { organizationBranding } from "@/shared/branding/organizationBranding";
import type { InvoiceDocument } from "./InvoiceDocumentBuilder";

const money = (value: number, currency: string) => currency === "PHP"
  ? formatPhpCurrency(value)
  : new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function InvoiceDocumentView({ document }: { document: InvoiceDocument }) {
  const [email, setEmail] = useState<ReturnType<typeof buildBillingStatementEmail>>();
  const prepareEmail = async () => {
    const prepared = buildBillingStatementEmail({ statementNumber: document.statementNo, rentalNumber: document.rentalNumber, customer: document.customer, representativeName: document.customerRepresentativeName ?? "Customer Representative", recipient: document.customerRepresentativeEmail ?? "", project: document.project, billingFrom: document.billingFrom, billingTo: document.billingTo, amountDue: document.grandTotal, currency: document.currency });
    setEmail(prepared);
    const logoResponse = await fetch(organizationBranding.logoAssetPath);
    const logoBytes = logoResponse.ok ? new Uint8Array(await logoResponse.arrayBuffer()) : undefined;
    const pdf = generateBillingStatementPdf(document, undefined, logoBytes);
    const blob = new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.statementNo}-billing-statement.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <article className="invoice-document rounded-xl border bg-white p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="flex items-center gap-4">
        <img className="h-14 w-[133px] object-contain" src={organizationBranding.logoAssetPath} alt={organizationBranding.logoAltText}/>
        <div><p className="font-bold uppercase">{organizationBranding.companyName}</p><p className="text-sm text-slate-600">{organizationBranding.departmentName}</p><h2 className="mt-1 text-xl font-bold">Billing Statement</h2></div>
      </div>
      <div className="text-right text-sm"><b>{document.statementNo}</b><p>{document.status}</p><div className="mt-2 flex gap-2"><button type="button" className="print:hidden rounded border px-3 py-1" onClick={()=>window.print()}>Print</button><button type="button" className="print:hidden rounded border px-3 py-1" onClick={prepareEmail}>Email</button></div></div>
    </header>
    <section className="mt-4 grid gap-2 rounded border bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <p><b>Rental:</b> {document.rentalNumber}</p><p><b>Billing period:</b> {document.billingFrom} to {document.billingTo}</p><p><b>Statement date:</b> {document.statementDate.slice(0,10)}</p>
      <p><b>Customer:</b> {document.customer}</p><p><b>Representative:</b> {document.customerRepresentativeName ?? "Not provided"}</p><p><b>Email:</b> {document.customerRepresentativeEmail ?? "Not provided"}</p>
      <p><b>Project:</b> {document.project}</p>
    </section>
    {email&&<section className="mt-4 space-y-2 rounded border bg-blue-50 p-4 text-sm"><h3 className="font-semibold">Prepared Billing Email</h3><p><b>To:</b> {email.recipient||"Recipient email unavailable"}</p><p><b>Subject:</b> {email.subject}</p><pre className="whitespace-pre-wrap font-sans">{email.body}</pre><a className="inline-block rounded bg-blue-700 px-3 py-2 text-white" href={`mailto:${encodeURIComponent(email.recipient)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>Open Email Draft</a><p className="text-xs font-medium">Attach the generated PDF before sending.</p></section>}
    {document.warnings.length>0&&<div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><div className="font-semibold">Reconciliation / historical warnings</div><ul className="mt-1 list-disc pl-5">{document.warnings.map((warning,index)=><li key={`${warning.code}-${warning.lineId??index}`}>{warning.message}</li>)}</ul></div>}
    <ResponsiveTable><table className="mt-5 min-w-max text-xs"><thead className="bg-slate-100"><tr>{["DEUR","Date","Equipment / Operator","Description","Method","Qty","Rate","Amount"].map(heading=><th key={heading} className={`px-2 py-2 ${["Qty","Rate","Amount"].includes(heading)?"text-right":"text-left"}`}>{heading}</th>)}</tr></thead><tbody>{document.lines.map(line=><tr key={line.id??line.deurId} className="border-t align-top"><td className="px-2 py-2">{line.deurReference??"DEUR reference unavailable"}</td><td className="px-2 py-2">{line.workDate}</td><td className="px-2 py-2">{line.equipmentLabel}<br/><span className="text-slate-500">{line.operatorLabel}</span></td><td className="max-w-64 whitespace-normal px-2 py-2">{line.description}</td><td className="px-2 py-2">{line.billingMethod??"—"}</td><td className="px-2 py-2 text-right">{line.quantity!==undefined?`${line.quantity.toFixed(2)} ${line.unit??""}`:formatOperationalHours(line.hours)}</td><td className="px-2 py-2 text-right">{money(line.unitRate??line.hourlyRate,document.currency)}</td><td className="px-2 py-2 text-right font-medium">{money(line.grandTotal??line.amount,document.currency)}</td></tr>)}</tbody></table></ResponsiveTable>
    <dl className="ml-auto mt-5 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm"><dt>Subtotal</dt><dd className="text-right">{money(document.subtotal,document.currency)}</dd>{document.optionalChargeTotals.map(charge=><div className="contents" key={charge.label}><dt>{charge.label}:</dt><dd className="text-right">{money(charge.amount,document.currency)}</dd></div>)}{document.vatApplicable&&<><dt>VAT</dt><dd className="text-right">{money(document.vat??0,document.currency)}</dd></>}{document.withholdingTaxApplicable&&<><dt>Withholding tax</dt><dd className="text-right">({money(document.withholdingTax??0,document.currency)})</dd></>}<dt className="border-t pt-2 font-bold">Grand total</dt><dd className="border-t pt-2 text-right font-bold">{money(document.grandTotal,document.currency)}</dd>{document.amountCollected!==undefined&&<><dt>Amount collected</dt><dd className="text-right">{money(document.amountCollected,document.currency)}</dd></>}{document.outstandingBalance!==undefined&&<><dt>Outstanding amount</dt><dd className="text-right">{money(document.outstandingBalance,document.currency)}</dd></>}</dl>
    <footer className="mt-6 border-t pt-3 text-center text-xs text-slate-500">{organizationBranding.documentFooter}<br/>{organizationBranding.systemName}</footer>
  </article>;
}
