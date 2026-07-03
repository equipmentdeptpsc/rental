import { useCustomer } from "../context/CustomerContext";

export default function CustomerStats() {
  const { customers } =
    useCustomer();

  const active =
    customers.filter(
      (c) => c.active
    ).length;

  return (
    <div className="grid grid-cols-2 gap-4">

      <div className="rounded-xl bg-white p-6 shadow">

        <p className="text-sm text-slate-500">
          Total Customers
        </p>

        <h2 className="text-3xl font-bold">
          {customers.length}
        </h2>

      </div>

      <div className="rounded-xl bg-white p-6 shadow">

        <p className="text-sm text-slate-500">
          Active Customers
        </p>

        <h2 className="text-3xl font-bold">
          {active}
        </h2>

      </div>

    </div>
  );
}