import { useState } from "react";
import { useNavigate } from "react-router-dom";

import EquipmentStats from "@/features/equipment/components/EquipmentStats";
import EquipmentToolbar from "@/features/equipment/components/EquipmentToolbar";
import EquipmentTable from "@/features/equipment/components/EquipmentTable";
import EquipmentDetailsDrawer from "@/features/equipment/components/EquipmentDetailsDrawer";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAuth } from "@/features/auth/AuthContext";

export default function Equipment() {
  const navigate = useNavigate();
  const { equipment } = useEquipment();
  const { user, logout } = useAuth();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] =
    useState<any>(null);

  // FILTER STATE (required by toolbar)
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");

  const activeEquipment = equipment.filter(
    (e) => !e.deleted
  );

  const filteredEquipment = activeEquipment.filter((item) => {
    const matchesSearch =
      item.assetNo
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      item.equipmentName
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesStatus =
      status === "All" || item.status === status;

    const matchesCategory =
      category === "All" || item.category === category;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesCategory
    );
  });

  return (
    <div className="space-y-8 p-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Equipment Dashboard
          </h1>

          <p className="text-slate-500">
            Monitor equipment availability, utilization, and maintenance.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">
              {user?.name}
            </div>
            <div className="text-xs text-slate-500">
              {user?.role}
            </div>
          </div>

          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="rounded bg-red-600 px-3 py-1 text-white text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      <EquipmentStats />

      <EquipmentToolbar
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        category={category}
        setCategory={setCategory}
        equipment={activeEquipment}
      />

      <EquipmentTable
        equipment={filteredEquipment}
        onView={(item) => {
          setSelectedEquipment(item);
          setDrawerOpen(true);
        }}
      />

      <EquipmentDetailsDrawer
        open={drawerOpen}
        equipment={selectedEquipment}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}