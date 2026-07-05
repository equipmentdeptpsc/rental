import type {
    EquipmentLeaderboard,
  } from "../../services/dashboard.service";
  
  interface Props {
    topEquipment: EquipmentLeaderboard[];
    leastEquipment: EquipmentLeaderboard[];
  }
  
  interface TableProps {
    title: string;
    items: EquipmentLeaderboard[];
  }
  
  function LeaderboardTable({
    title,
    items,
  }: TableProps) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="mb-5 text-lg font-semibold">
          {title}
        </h2>
  
        {items.length === 0 ? (
  
          <div className="py-8 text-center text-slate-500">
            No equipment found.
          </div>
  
        ) : (
  
          <table className="w-full">
  
            <thead>
  
              <tr className="border-b">
  
                <th className="py-2 text-left">
                  Asset
                </th>
  
                <th className="py-2 text-left">
                  Equipment
                </th>
  
                <th className="py-2 text-right">
                  Reading
                </th>
  
              </tr>
  
            </thead>
  
            <tbody>
  
              {items.map((item) => (
  
                <tr
                  key={item.equipmentId}
                  className="border-b last:border-none"
                >
  
                  <td className="py-3">
                    {item.assetNo}
                  </td>
  
                  <td className="py-3">
                    {item.equipmentName}
                  </td>
  
                  <td className="py-3 text-right font-semibold">
                    {item.reading.toLocaleString()}
                  </td>
  
                </tr>
  
              ))}
  
            </tbody>
  
          </table>
  
        )}
  
      </div>
    );
  }
  
  export default function EquipmentLeaderboard({
    topEquipment,
    leastEquipment,
  }: Props) {
  
    return (
  
      <div className="grid gap-6 lg:grid-cols-2">
  
        <LeaderboardTable
          title="Top Equipment Usage"
          items={topEquipment}
        />
  
        <LeaderboardTable
          title="Lowest Equipment Usage"
          items={leastEquipment}
        />
  
      </div>
  
    );
  
  }