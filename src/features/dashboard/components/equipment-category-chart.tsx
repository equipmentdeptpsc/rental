import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Props { data: { name: string; value: number }[] }
export default function EquipmentCategoryChart({ data }: Props) {
  return <section className="dashboard-panel" aria-label="Equipment counts by category">
    <h2 className="dashboard-panel-title px-4 pt-4">Equipment by Category</h2>
    <div className="h-36 px-2 pb-3"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -24 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#dbe3ee" /><XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[5, 5, 0, 0]} label={{ position: "top", fontSize: 11 }} /></BarChart></ResponsiveContainer></div>
  </section>;
}
