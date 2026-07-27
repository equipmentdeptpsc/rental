import {
    useInvoiceSummary,
  } from "./useInvoiceSummary";
  
  import InvoiceMetricCard from "./InvoiceMetricCard";
  import InvoiceDocumentView from "./InvoiceDocumentView";
  import { formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
  
  export default function InvoicePanel() {
    const invoice =
      useInvoiceSummary();
  
    return (
      <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
  
        <InvoiceMetricCard
          label="Invoices"
          value={
            invoice.invoiceCount.toString()
          }
        />
  
        <InvoiceMetricCard
          label="Total Invoiced"
          value={formatPhpCurrency(invoice.totalInvoiced)}
        />
  
        <InvoiceMetricCard
          label="Outstanding"
          value={formatPhpCurrency(invoice.outstanding)}
        />
  
        <InvoiceMetricCard
          label="Latest Invoice"
          value={
            invoice.latestInvoiceNo ??
            "-"
          }
        />
  
      </div>
      {invoice.documents.length === 0 ? <div className="rounded-xl border bg-white p-6 text-center text-slate-500">No Billing Statement or Invoice is available.</div> : invoice.documents.map((document) => <InvoiceDocumentView key={document.billingStatementId} document={document} />)}
      </div>
    );
  }
