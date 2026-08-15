import { Link, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EntityDetailLayout, { EntityDetailAside, EntityDetailMain, EntitySection } from "@/components/entity/EntityDetailLayout";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { getRentalEquipmentLabel } from "@/features/rental/utils/rentalFormOptions";

export default function CustomerDetails() {
  const { id } = useParams();
  const { customers } = useCustomer();
  const { rentals } = useRental();
  const { getEquipment } = useEquipment();
  const customer = customers.find((c) => c.id === id);

  if (!customer) {
    return <div className="p-8">Customer not found.</div>;
  }

  const customerRentals = rentals.filter((r) => r.customer === customer.companyName);
  const activeRentals = customerRentals.filter((rental) => ["Active", "Released", "Reserved"].includes(rental.status)).length;

  return (
    <EntityDetailLayout
      title={customer.companyName}
      subtitle={customer.customerCode}
      status={customer.active ? "Active" : "Inactive"}
      statusTone={customer.active ? "success" : "neutral"}
      actions={<Link to={`/customers/edit/${customer.id}`}><Button>Edit Customer</Button></Link>}
      kpis={<>
        <KpiCard label="Total Rentals" value={customerRentals.length} caption="Historical rental transactions" tone="blue" />
        <KpiCard label="Active Rentals" value={activeRentals} caption="Released, reserved, or active" tone="purple" />
        <KpiCard label="Contact" value={customer.contactPerson} caption={customer.contactNumber} tone="slate" />
        <KpiCard label="Email" value={customer.email} caption={customer.address} tone="green" />
      </>}
    >
      <EntityDetailMain>
        <EntitySection title="Rental History">
          <div className="overflow-x-auto">
            <table className="app-table min-w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">Equipment</th>
                  <th className="p-3 text-left">Project</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {customerRentals.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-slate-500">No rental history for this customer.</td></tr>
                ) : customerRentals.map((rental) => (
                  <tr key={rental.id} className="border-t">
                    <td className="p-3">{getRentalEquipmentLabel(getEquipment(rental.equipmentId))}</td>
                    <td className="p-3">{rental.project}</td>
                    <td className="p-3"><StatusBadge tone={rental.status === "Closed" ? "neutral" : "info"}>{rental.status}</StatusBadge></td>
                    <td className="p-3"><Link className="app-link" to={`/rentals/${rental.id}/workspace`}>Open Workspace</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EntitySection>
      </EntityDetailMain>
      <EntityDetailAside>
        <EntitySection title="Contact Profile">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500">Code</dt><dd className="font-medium">{customer.customerCode}</dd></div>
            <div><dt className="text-slate-500">Contact Person</dt><dd>{customer.contactPerson}</dd></div>
            <div><dt className="text-slate-500">Phone</dt><dd>{customer.contactNumber}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd>{customer.email}</dd></div>
            <div><dt className="text-slate-500">Address</dt><dd>{customer.address}</dd></div>
          </dl>
        </EntitySection>
      </EntityDetailAside>
    </EntityDetailLayout>
  );
}
