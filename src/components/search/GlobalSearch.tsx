import { useMemo, useState } from "react";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useProject } from "@/features/project/context/ProjectContext";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");

  const { equipment } = useEquipment();
  const { operators } = useOperator();
  const { customers } = useCustomer();
  const { projects } = useProject();

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const keyword = query.toLowerCase();

    return [
      ...equipment
        .filter(
          (e) =>
            e.assetNo
              .toLowerCase()
              .includes(keyword) ||
            e.equipmentName
              .toLowerCase()
              .includes(keyword)
        )
        .map((e) => ({
          type: "Equipment",
          title: e.equipmentName,
          subtitle: e.assetNo,
        })),

      ...operators
        .filter((o) =>
          o.name
            .toLowerCase()
            .includes(keyword)
        )
        .map((o) => ({
          type: "Operator",
          title: o.name,
          subtitle: o.licenseNumber,
        })),

        ...customers
        .filter(
          (c) =>
            c.companyName
              .toLowerCase()
              .includes(keyword) ||
            c.customerCode
              .toLowerCase()
              .includes(keyword) ||
            c.contactPerson
              .toLowerCase()
              .includes(keyword)
        )
        .map((c) => ({
          type: "Customer",
          title: c.companyName,
          subtitle: `${c.customerCode} • ${c.contactPerson}`,
        })),

      ...projects
        .filter((p) =>
          p.projectName
            .toLowerCase()
            .includes(keyword)
        )
        .map((p) => ({
          type: "Project",
          title: p.projectName,
          subtitle: p.client,
        })),
    ];
  }, [
    query,
    equipment,
    operators,
    customers,
    projects,
  ]);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <input
        className="w-full rounded-lg border p-3"
        placeholder="Search equipment, customer, operator, project..."
        value={query}
        onChange={(e) =>
          setQuery(e.target.value)
        }
      />

      {query && (
        <div className="mt-4 space-y-2">
          {results.length === 0 && (
            <div className="text-slate-500">
              No results found.
            </div>
          )}

          {results.map((r, index) => (
            <div
              key={index}
              className="rounded border p-3"
            >
              <div className="font-semibold">
                {r.title}
              </div>

              <div className="text-sm text-slate-500">
                {r.type} • {r.subtitle}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}