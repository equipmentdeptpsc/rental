import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import EquipmentTable from "@/features/equipment/components/EquipmentTable";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function EquipmentPage() {
  const {
    equipment,
    deleteEquipment,
  } = useEquipment();

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

      <EquipmentTable
        equipment={equipment}
        onDelete={deleteEquipment}
      />

    </div>
  );
}