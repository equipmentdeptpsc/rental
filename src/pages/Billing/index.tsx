import { Link } from "react-router-dom";

import ResponsiveTable from "@/components/ui/ResponsiveTable";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import { EmptyDataState } from "@/components/ui/AsyncState";

import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { useRental } from "@/features/rental/context/RentalContext";
import { useEffect, useState } from "react";
import { billingWorkspaceHref } from "@/features/rental/workspace/routing";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { RentalRecord } from "@/features/rental/types";

export default function Billing() {
  const { rentals } = useRental();
  const dependencies = useApplicationDependenciesCompatibility();
  const remote = dependencies.configuration.persistenceMode === PersistenceMode.Remote;
  const [query,setQuery]=useState("");
  const [remoteStatements,setRemoteStatements]=useState<BillingStatement[]>([]);
  const [remoteRentals,setRemoteRentals]=useState<RentalRecord[]>([]);
  const [remoteState,setRemoteState]=useState<"loading"|"ready"|"error">(remote ? "loading" : "ready");
  useEffect(() => {
    if (!remote) return;
    let active = true; setRemoteState("loading");
    void Promise.all([dependencies.readRepositories.billing.list(), dependencies.readRepositories.rentals.list()]).then(([billing, rental]) => {
      if (!active) return;
      if (billing.success && rental.success) { setRemoteStatements(billing.value.items); setRemoteRentals(rental.value.items); setRemoteState("ready"); }
      else setRemoteState("error");
    }).catch(() => { if (active) setRemoteState("error"); });
    return () => { active = false; };
  }, [dependencies.readRepositories.billing, dependencies.readRepositories.rentals, remote]);
  const statements = (remote ? remoteStatements : billingStatementRepository.search(query)).filter((statement) => !query || [statement.statementNo, statement.rentalNumber, statement.customer, statement.project].some((value) => value?.toLowerCase().includes(query.toLowerCase())));
  const displayedRentals = remote ? remoteRentals : rentals;

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <PageHeader title="Billing" description="Review billing statements or open a rental workspace to generate billing." />

      <div className="rounded-xl border bg-white p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Billing Statements</h2>
        <FilterBar onClear={() => setQuery("")} canClear={Boolean(query)}><label className="min-w-[min(100%,28rem)] flex-1 text-sm font-medium">Search billing<input aria-label="Search Billing" className="app-control mt-1 w-full" placeholder="Search statement, rental, customer, project, or equipment reference" value={query} onChange={event=>setQuery(event.target.value)}/></label></FilterBar>
        {remoteState === "loading" ? <p className="mt-4 text-slate-500">Loading canonical billing statements…</p> : remoteState === "error" ? <p className="mt-4 text-red-700">Canonical billing statements could not be loaded.</p> : statements.length === 0 ? (
          <EmptyDataState title={query ? "No billing statements match these filters" : "No billing statements yet"} description="Statements appear here when they are created through the canonical rental billing workflow." />
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
                    <td className="px-4 py-3"><StatusBadge tone={statement.invoiceStatus.toLowerCase().includes("paid") ? "success" : "neutral"}>{statement.invoiceStatus}</StatusBadge></td>
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
        {displayedRentals.length === 0 ? (
          <p className="mt-4 text-slate-500">No rental transactions are available.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {displayedRentals.map((rental) => (
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
