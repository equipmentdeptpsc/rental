import { useRef, useState } from "react";
import { useApplicationDependencies } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import { getInvoiceCreationEligibility } from "@/features/rental/billingstatement/services/invoiceCreationEligibility";
import { notifyRentalWorkspaceChange } from "../workspaceRefresh";
import { useRentalWorkspaceAggregate, useRentalWorkspaceBillingStatements } from "..";
import { useInvoiceSummary } from "./useInvoiceSummary";
import InvoiceMetricCard from "./InvoiceMetricCard";
import InvoiceDocumentView from "./InvoiceDocumentView";

export default function InvoicePanel() {
  const invoice = useInvoiceSummary();
  const aggregate = useRentalWorkspaceAggregate();
  const statements = useRentalWorkspaceBillingStatements();
  const dependencies = useApplicationDependencies();
  const { hasPermission } = useAuth();
  const [creatingStatementId, setCreatingStatementId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const inFlight = useRef(new Set<string>());
  const canUpdateBilling = hasPermission("billing.update");
  const readyToInvoice = statements.filter((statement) => getInvoiceCreationEligibility(statement, canUpdateBilling).eligible);

  const createInvoice = async (statement: typeof statements[number]) => {
    const eligibility = getInvoiceCreationEligibility(statement, canUpdateBilling);
    if (!eligibility.eligible || inFlight.current.has(statement.id)) {
      setMessage(eligibility.reason);
      return;
    }
    if (!window.confirm(`Create invoice for ${statement.statementNo} for ${formatPhpCurrency(statement.grandTotal ?? statement.subtotal)}?`)) return;
    inFlight.current.add(statement.id);
    setCreatingStatementId(statement.id);
    setMessage(undefined);
    try {
      const result = await dependencies.commandRepositories.billingFinancialCommands.createInvoice({
        commandId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        statementId: statement.id,
        expectedVersion: statement.version,
      });
      if (result.success) {
        setMessage(`Invoice created for ${statement.statementNo}. Refreshing the invoice view.`);
        notifyRentalWorkspaceChange(aggregate.rental.id);
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("Invoice creation result is unclear. Refresh before any further action.");
    } finally {
      inFlight.current.delete(statement.id);
      setCreatingStatementId(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <InvoiceMetricCard label="Invoices" value={invoice.invoiceCount.toString()} />
        <InvoiceMetricCard label="Total Invoiced" value={formatPhpCurrency(invoice.totalInvoiced)} />
        <InvoiceMetricCard label="Outstanding" value={formatPhpCurrency(invoice.outstanding)} />
        <InvoiceMetricCard label="Latest Invoice" value={invoice.latestInvoiceNo ?? "-"} />
      </div>

      {readyToInvoice.length > 0 && <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-6" aria-label="Billing statements ready to invoice">
        <div><h2 className="text-lg font-semibold">Ready to Invoice</h2><p className="text-sm text-slate-600">Approved billing statements awaiting their single canonical invoice.</p></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-blue-200 text-left"><th className="px-3 py-2">Billing Statement</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Rental</th><th className="px-3 py-2">Billing period</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Approval</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{readyToInvoice.map((statement) => <tr key={statement.id} className="border-t border-blue-200"><td className="px-3 py-3 font-medium">{statement.statementNo}</td><td className="px-3 py-3">{statement.customer}</td><td className="px-3 py-3">{statement.rentalNumber ?? aggregate.rental.rentalNumber ?? aggregate.rental.id}</td><td className="px-3 py-3">{statement.billingFrom} – {statement.billingTo}</td><td className="px-3 py-3 text-right">{formatPhpCurrency(statement.grandTotal ?? statement.subtotal)}</td><td className="px-3 py-3">{statement.approvalStatus}</td><td className="px-3 py-3">{statement.invoiceStatus}</td><td className="px-3 py-3 text-right"><button type="button" className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={creatingStatementId === statement.id} onClick={() => void createInvoice(statement)}>{creatingStatementId === statement.id ? "Creating…" : "Create Invoice"}</button></td></tr>)}</tbody></table></div>
      </section>}

      {message && <p className="rounded border border-blue-300 bg-white p-3 text-sm" role="status">{message}</p>}

      {invoice.documents.length === 0 && readyToInvoice.length === 0 ? <div className="rounded-xl border bg-white p-6 text-center text-slate-500">No Billing Statement or Invoice is available.</div> : invoice.documents.map((document) => <InvoiceDocumentView key={document.billingStatementId} document={document} />)}
    </div>
  );
}
