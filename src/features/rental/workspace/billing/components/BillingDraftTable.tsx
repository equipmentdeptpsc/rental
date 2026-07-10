import type {
    BillingStatement,
  } from "@/features/rental/billingstatement/types";
  
  interface Props {
  
    drafts: BillingStatement[];
  
    onDelete(
      id: string
    ): void;
  
  }
  
  export default function BillingDraftTable({
  
    drafts,
  
    onDelete,
  
  }: Props) {
  
    if (drafts.length === 0) {
  
      return (
  
        <div className="rounded-xl border bg-white p-6 text-center text-slate-500">
  
          No Billing Statements found.
  
        </div>
  
      );
  
    }
  
    return (
  
      <div className="rounded-xl border bg-white overflow-hidden">
  
        <table className="min-w-full text-sm">
  
          <thead className="bg-slate-100">
  
            <tr>
  
              <th className="px-4 py-3 text-left">
                Billing No.
              </th>
  
              <th className="px-4 py-3 text-left">
                Customer
              </th>
  
              <th className="px-4 py-3 text-left">
                Project
              </th>
  
              <th className="px-4 py-3 text-center">
                Period
              </th>
  
              <th className="px-4 py-3 text-right">
                Amount
              </th>
  
              <th className="px-4 py-3 text-center">
                Approval
              </th>
  
              <th className="px-4 py-3 text-center">
                Invoice
              </th>
  
              <th className="px-4 py-3 text-center">
                Actions
              </th>
  
            </tr>
  
          </thead>
  
          <tbody>
  
            {drafts.map((draft) => (
  
              <tr
                key={draft.id}
                className="border-t"
              >
  
                <td className="px-4 py-3">
                  {draft.statementNo}
                </td>
  
                <td className="px-4 py-3">
                  {draft.customer}
                </td>
  
                <td className="px-4 py-3">
                  {draft.project}
                </td>
  
                <td className="px-4 py-3 text-center">
                  {draft.billingFrom} - {draft.billingTo}
                </td>
  
                <td className="px-4 py-3 text-right">
                  {draft.subtotal.toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                    }
                  )}
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
  
                    {draft.approvalStatus}
  
                  </span>
  
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
  
                    {draft.invoiceStatus}
  
                  </span>
  
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  <button
                    onClick={() =>
                      onDelete(
                        draft.id
                      )
                    }
                    className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
  
                </td>
  
              </tr>
  
            ))}
  
          </tbody>
  
        </table>
  
      </div>
  
    );
  
  }