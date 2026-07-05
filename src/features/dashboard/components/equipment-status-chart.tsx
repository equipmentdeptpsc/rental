import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend,
  } from "recharts";
  
  interface Props {
    data: {
      name: string;
      value: number;
    }[];
  }
  
  const COLORS = [
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
  ];
  
  export default function EquipmentStatusChart({
    data,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-semibold">
          Equipment Status
        </h2>
  
        <div className="h-80">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label
              >
                {data.map(
                  (_, index) => (
                    <Cell
                      key={index}
                      fill={
                        COLORS[
                          index %
                            COLORS.length
                        ]
                      }
                    />
                  )
                )}
              </Pie>
  
              <Tooltip />
  
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }