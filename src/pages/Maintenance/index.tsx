import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import { EmptyDataState } from "@/components/ui/AsyncState";

import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { getMaintenanceDueEquipment } from "@/features/maintenance";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useState } from "react";
import { filterMaintenanceDue, maintenanceHealth, type MaintenanceHealthFilter } from "@/features/maintenance/services/maintenanceListFilters";

export default function MaintenancePage() {
  const [filter,setFilter]=useState<MaintenanceHealthFilter>("All");
  const { maintenance } =
    useMaintenance();

  const { equipment } =
    useEquipment();

  const dueEquipment =
    getMaintenanceDueEquipment(
      equipment,
      maintenance
    );

  const overdue =
    dueEquipment.filter(
      (x) => x.due
    );

  const dueSoon =
    dueEquipment.filter(
      (x) =>
        !x.due &&
        x.remaining <= 50
    );

  const healthy =
    dueEquipment.filter(
      (x) =>
        !x.due &&
        x.remaining > 50
    );
  const filtered=filterMaintenanceDue(dueEquipment,filter);
  const cards:[[MaintenanceHealthFilter,number,string],...[MaintenanceHealthFilter,number,string][]]=[["All",dueEquipment.length,"blue"],["Overdue",overdue.length,"red"],["Due Soon",dueSoon.length,"amber"],["Healthy",healthy.length,"green"]];

  return (
    <div className="app-page">

      <PageHeader title="Maintenance" description="Fleet maintenance monitoring" actions={<Link to="/maintenance/new"><Button>Schedule Maintenance</Button></Link>} />

      <FilterBar onClear={() => setFilter("All")} canClear={filter !== "All"}><div className="text-sm text-slate-600 dark:text-slate-300">Filter by maintenance health</div>{cards.map(([label,count])=><button type="button" key={label} aria-pressed={filter===label} onClick={()=>setFilter(label)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${filter===label?"border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50":"border-slate-300 dark:border-slate-600"}`}>{label} <span className="font-semibold">{count}</span></button>)}</FilterBar>

      {filtered.length === 0 ? <EmptyDataState title={filter === "All" ? "No maintenance records yet" : "No maintenance records match the current filters"} description="Scheduled maintenance and due equipment will appear here through the canonical maintenance workflow." /> : <ResponsiveTable><div className="rounded-xl border bg-white min-w-max">

        <table className="min-w-full">

          <thead className="bg-gray-100">

            <tr>

              <th className="px-4 py-3 text-left">
                Asset No.
              </th>

              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-right">
                Current Reading
              </th>

              <th className="px-4 py-3 text-right">
                Remaining
              </th>

              <th className="px-4 py-3 text-center">
                Status
              </th>
              <th className="px-4 py-3 text-right">Actions</th>

            </tr>

          </thead>

          <tbody>

            {filtered.map(
              (item) => (

                <tr
                  key={
                    item.equipment.id
                  }
                  className="border-t"
                >

                  <td className="px-4 py-3">
                    {
                      item.equipment
                        .assetNo
                    }
                  </td>

                  <td className="px-4 py-3">
                    {
                      item.equipment
                        .equipmentName
                    }
                  </td>

                  <td className="px-4 py-3 text-right">
                    {
                      item.equipment
                        .currentReading
                    }
                  </td>

                  <td className="px-4 py-3 text-right">
                    {item.remaining}
                  </td>

                  <td className="px-4 py-3 text-center">

                    {item.due ? (

                      <StatusBadge tone="danger">Overdue</StatusBadge>

                    ) : item.remaining <=
                      50 ? (

                      <StatusBadge tone="warning">Due Soon</StatusBadge>

                    ) : (

                      <StatusBadge tone="success">{item.equipment.status === "Maintenance" ? "In Maintenance" : maintenanceHealth(item)}</StatusBadge>

                    )}

                  </td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2"><Link to={`/equipment/${item.equipment.id}`}><Button variant="secondary">View Details</Button></Link>{item.equipment.status === "Maintenance" && maintenance.find(record=>record.equipmentId===item.equipment.id&&record.status!=="Completed")?<Link to={`/maintenance/${maintenance.find(record=>record.equipmentId===item.equipment.id&&record.status!=="Completed")!.id}`}><Button variant="secondary">View Maintenance</Button></Link>:<Link to={`/maintenance/new?equipment=${encodeURIComponent(item.equipment.id)}`}><Button variant="secondary">Schedule Maintenance</Button></Link>}</div></td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div></ResponsiveTable>}

    </div>
  );
}
