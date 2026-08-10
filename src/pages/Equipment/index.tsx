import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import EquipmentTable from "@/features/equipment/components/EquipmentTable";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useState } from "react";

export default function EquipmentPage() {
  const {
    equipment,
    deleteEquipment,
  } = useEquipment();
  const [query,setQuery]=useState("");
  const filtered=equipment.filter(item=>`${item.assetNo} ${item.equipmentName} ${item.category} ${item.subcategoryName??""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-3xl font-bold">
            Equipment
          </h1>

          <p className="text-gray-500">
            Manage company equipment.
          </p>
        </div>

        <div className="flex gap-3">

          <Link to="/equipment/trash">
            <Button variant="secondary">
              Trash
            </Button>
          </Link>

          <Link to="/equipment/new">
            <Button>
              Add Equipment
            </Button>
          </Link>

        </div>

      </div>

      <input aria-label="Search Equipment" className="w-full rounded border bg-white p-3" placeholder="Search asset number, equipment name, category, or sub-category" value={query} onChange={event=>setQuery(event.target.value)}/>
      <EquipmentTable
        equipment={filtered}
        onDelete={deleteEquipment}
      />

    </div>
  );
}
