import { Link } from "react-router-dom";

import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { useRental } from "@/features/rental/context/RentalContext";
import { useState } from "react";
import { billingWorkspaceHref } from "@/features/rental/workspace/routing";

export default function Billing() {
  const { rentals } = useRental();
  const[query,setQuery]=useState("");const statements = billingStatementRepository.search(query);

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="mt-2 text-gray-500">
          Review billing statements or open a rental workspace to generate billing.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Billing Statements</h2>
        <input aria-label="Search Billing" className="mt-4 w-full rounded border p-3" placeholder="Search statement, rental, customer, project, or equipment reference" value={query} onChange={event=>setQuery(event.target.value)}/>
        {statements.length === 0 ? (
          <p className="mt-4 text-slate-500">
            No billing statements have been created. Open a rental workspace and select Billing to generate one.
          </p>
        ) : (
          <ResponsiveTable>
            <table className="mt-4 min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left">Statement</th>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3 text-left">Invoice Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((statement) => (
                  <tr key={statement.id} className="border-t">
                    <td className="px-4 py-3">{statement.statementNo}</td>
                    <td className="px-4 py-3">{statement.project || "Project not assigned"}</td>
                    <td className="px-4 py-3">{statement.billingFrom} to {statement.billingTo}</td>
                    <td className="px-4 py-3 text-right">{statement.subtotal}</td>
                    <td className="px-4 py-3">{statement.invoiceStatus}</td>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-blue-600 hover:underline" to={billingWorkspaceHref(statement.rentalId, statement.id)}>
                        Open Billing Workspace
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Rental Billing Workspaces</h2>
        {rentals.length === 0 ? (
          <p className="mt-4 text-slate-500">No rental transactions are available.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {rentals.map((rental) => (
              <Link
                key={rental.id}
                to={`/rentals/${rental.id}/workspace`}
                className="rounded-lg border px-4 py-3 text-sm font-medium text-blue-600 hover:bg-slate-50"
              >
                {rental.rentalNumber} — Open Billing
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
