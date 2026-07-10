import {
    useInvoiceSummary,
  } from "./useInvoiceSummary";
  
  import InvoiceMetricCard from "./InvoiceMetricCard";
  
  export default function InvoicePanel() {
    const invoice =
      useInvoiceSummary();
  
    return (
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
    );
  }