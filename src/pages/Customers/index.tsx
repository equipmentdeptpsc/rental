import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import CustomerStats from "@/features/customer/components/CustomerStats";
import { useCustomer } from "@/features/customer/context/CustomerContext";

export default function CustomerPage() {
  const { customers } = useCustomer();

  return (
    <div className="space-y-8 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Customers
          </h1>

          <p className="text-slate-500">
            Customer Master
          </p>

        </div>

        <Link to="/customers/new">

          <Button>
            New Customer
          </Button>

        </Link>

      </div>

      <CustomerStats />

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

            {customers.length === 0 ? (

              <tr>

                <td
                  colSpan={5}
                  className="p-6 text-center text-slate-500"
                >
                  No customers found.
                </td>

              </tr>

            ) : (

              customers.map((customer) => (

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
