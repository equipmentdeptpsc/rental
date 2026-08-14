import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface Props { data: { name: string; value: number }[] }
const color: Readonly<Record<string, string>> = { Assigned: "#2563eb", Available: "#22c55e", Maintenance: "#f59e0b", Rented: "#8b5cf6" };

export default function EquipmentStatusChart({ data }: Props) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const ordered = ["Assigned", "Available", "Maintenance"].map((name) => data.find((item) => item.name === name) ?? { name, value: 0 });
  return <section className="dashboard-panel" aria-label="Equipment status distribution">
    <h2 className="dashboard-panel-title">Equipment Status</h2>
    <div className="grid min-h-48 items-center gap-4 sm:grid-cols-[1fr_1.25fr]">
      <div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={ordered} dataKey="value" nameKey="name" innerRadius={55} outerRadius={76} stroke="#fff" strokeWidth={2}>{ordered.map((item) => <Cell key={item.name} fill={color[item.name]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
      <div>{ordered.map((item) => <div key={item.name} className="flex items-center border-b border-slate-100 py-3 text-xs last:border-0 dark:border-slate-800"><span className="mr-2 h-2.5 w-2.5" style={{ backgroundColor: color[item.name] }} /><span className="flex-1" style={{ color: color[item.name] }}>{item.name}</span><strong>{item.value} ({total ? Math.round(item.value / total * 100) : 0}%)</strong></div>)}</div>
    </div>
  </section>;
}
