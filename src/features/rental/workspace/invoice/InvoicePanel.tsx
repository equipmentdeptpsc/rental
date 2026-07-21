import {
    useInvoiceSummary,
  } from "./useInvoiceSummary";
  
  import InvoiceMetricCard from "./InvoiceMetricCard";
  import InvoiceDocumentView from "./InvoiceDocumentView";
  
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
          value={`₱ ${invoice.totalInvoiced.toLocaleString()}`}
        />
  
        <InvoiceMetricCard
          label="Outstanding"
          value={`₱ ${invoice.outstanding.toLocaleString()}`}
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
