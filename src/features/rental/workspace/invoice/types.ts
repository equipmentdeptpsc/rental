export interface InvoiceSummary {
    invoiceCount: number;
  
    totalInvoiced: number;
  
    outstanding: number;
  
    latestInvoiceNo?: string;
  
    latestInvoiceDate?: string;
  }