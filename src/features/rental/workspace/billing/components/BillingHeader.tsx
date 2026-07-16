import {
    useRentalWorkspaceAggregate,
  } from "../..";
  
  interface Props {
    from: string;
  
    to: string;
  }
  
  export default function BillingHeader({
    from,
    to,
  }: Props) {
  
    const aggregate =
      useRentalWorkspaceAggregate();
  
    return (
  
      <div className="rounded-xl border bg-white p-6">
  
        <h2 className="text-2xl font-bold">
          Billing Statement
        </h2>
  
        <div className="mt-6 grid gap-4 md:grid-cols-2">
  
          <div>
  
            <div className="text-sm text-slate-500">
              Customer
            </div>
  
            <div className="font-medium">
              {aggregate.rental.customer}
            </div>
  
          </div>
  
          <div>
  
            <div className="text-sm text-slate-500">
              Project
            </div>
  
            <div className="font-medium">
              {aggregate.rental.project}
            </div>
  
          </div>
  
          <div>
  
            <div className="text-sm text-slate-500">
              Equipment
            </div>
  
            <div className="font-medium">
              {aggregate.equipment?.equipmentName ?? "-"}
            </div>
  
          </div>
  
          <div>
  
            <div className="text-sm text-slate-500">
              Operator
            </div>
  
            <div className="font-medium">
              {aggregate.operator?.name ?? "-"}
            </div>
  
          </div>
  
          <div>
  
            <div className="text-sm text-slate-500">
              Billing Period
            </div>
  
            <div className="font-medium">
              {from} - {to}
            </div>
  
          </div>
  
          <div>
  
            <div className="text-sm text-slate-500">
              Status
            </div>
  
            <div className="font-medium text-blue-600">
              {aggregate.billing.invoiceStatus ?? "No billing statement"}
            </div>
  
          </div>
  
        </div>
  
      </div>
  
    );
  
  }
