import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
  } from "recharts";
  
  interface Props {
    data: {
      name: string;
      value: number;
    }[];
  }
  
  export default function EquipmentCategoryChart({
    data,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-semibold">
          Equipment by Category
        </h2>
  
        <div className="h-80">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
  
              <XAxis
                dataKey="name"
              />
  
              <YAxis
                allowDecimals={false}
              />
  
              <Tooltip />
  
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }