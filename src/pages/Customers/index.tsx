import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import FilterBar from "@/components/ui/FilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import { LoadingState, ErrorState, EmptyDataState } from "@/components/ui/AsyncState";
import { useMemo, useState } from "react";

import CustomerStats from "@/features/customer/components/CustomerStats";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useCanonicalCustomerData } from "@/features/customer/hooks/useCanonicalCustomerData";
import { getCustomerRuntimeCapability } from "@/features/customer/services/customerRuntimeCapability";
import { useAuth } from "@/features/auth/AuthContext";

export default function CustomerPage() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const capability = getCustomerRuntimeCapability(configuration, Boolean(commandRepositories.canonicalCustomer));
  const { hasPermission } = useAuth();
  return capability.canonicalReads ? <RemoteCustomerPage canCreate={capability.canonicalMutations && hasPermission("customer.create")} /> : <LocalCustomerPage />;
}

function RemoteCustomerPage({ canCreate }: { canCreate: boolean }) {
  const data = useCanonicalCustomerData();
  const [query, setQuery] = useState("");
  const customers = data.status === "loaded" ? data.items : [];
  const filtered = useMemo(() => customers.filter((customer) => `${customer.customerCode} ${customer.companyName} ${customer.email ?? ""} ${customer.contactNumber ?? ""}`.toLowerCase().includes(query.toLowerCase())), [customers, query]);
  if (data.status === "loading") return <div className="app-page"><LoadingState label="Loading canonical Customers…" /></div>;
  if (data.status === "error") return <div className="app-page"><ErrorState title="Customer data unavailable" message={data.message} onRetry={data.retry} /></div>;
  return <div className="app-page"><PageHeader title="Customers" description="Canonical Customer master" actions={canCreate ? <Link to="/customers/new"><Button>New Customer</Button></Link> : undefined} /><FilterBar onClear={() => setQuery("")} canClear={Boolean(query)}><input aria-label="Search customers" className="app-control min-w-[14rem] flex-1" placeholder="Search code, company, email, or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></FilterBar><ResponsiveTable><div className="min-w-max rounded-xl border bg-white"><table className="min-w-full"><thead className="bg-slate-100"><tr><th className="p-3 text-left">Code</th><th className="p-3 text-left">Customer</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Phone</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{filtered.length ? filtered.map((customer) => <tr className="border-t" key={customer.id}><td className="p-3">{customer.customerCode}</td><td className="p-3"><Link className="font-medium text-blue-600 hover:underline" to={`/customers/${customer.id}`}>{customer.companyName}</Link></td><td className="p-3">{customer.email ?? "—"}</td><td className="p-3">{customer.contactNumber ?? "—"}</td><td className="p-3"><StatusBadge tone={customer.active ? "success" : "neutral"}>{customer.active ? "Active" : "Inactive"}</StatusBadge></td></tr>) : <tr><td className="p-4" colSpan={5}><EmptyDataState title="No customers found" description="Try a different search term or clear the filters." /></td></tr>}</tbody></table></div></ResponsiveTable></div>;
}

function LocalCustomerPage() {
  const { customers } = useCustomer();
  const [query, setQuery] = useState("");
  const filtered = customers.filter((customer) => `${customer.customerCode} ${customer.companyName} ${customer.contactPerson} ${customer.contactNumber}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="app-page">
      <PageHeader
        title="Customers"
        description="Customer Master"
        actions={<Link to="/customers/new"><Button>New Customer</Button></Link>}
      />

      <CustomerStats />
      <FilterBar onClear={() => setQuery("")} canClear={Boolean(query)}><input aria-label="Search customers" className="app-control min-w-[14rem] flex-1" placeholder="Search code, company, contact, or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></FilterBar>

      <ResponsiveTable><div className="rounded-xl border bg-white min-w-max">

        <table className="min-w-full">

          <thead className="bg-slate-100">

            <tr>

              <th className="p-3 text-left">
                Code
              </th>

              <th className="p-3 text-left">
                Company
              </th>

              <th className="p-3 text-left">
                Contact
              </th>

              <th className="p-3 text-left">
                Phone
              </th>

              <th className="p-3 text-left">
                Action
              </th>

            </tr>

          </thead>

          <tbody>

            {filtered.length === 0 ? (

              <tr>

                <td
                  colSpan={5}
                  className="p-6 text-center text-slate-500"
                >
                  No customers found.
                </td>

              </tr>

            ) : (

              filtered.map((customer) => (

                <tr
                  key={customer.id}
                  className="border-t hover:bg-slate-50"
                >

                  <td className="p-3">
                    {customer.customerCode}
                  </td>

                  <td className="p-3">

                    <Link
                      to={`/customers/${customer.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {customer.companyName}
                    </Link>

                  </td>

                  <td className="p-3">
                    {customer.contactPerson}
                  </td>

                  <td className="p-3">
                    {customer.contactNumber}
                  </td>

                  <td className="p-3">

                    <Link
                      to={`/customers/edit/${customer.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>

                  </td>

                </tr>

              ))

            )}

          </tbody>

        </table>

      </div></ResponsiveTable>

    </div>
  );
}
