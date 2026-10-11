import { Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart, Legend } from "recharts";

const money = (value: number) => `₱${new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

export default function ManagementTrendChart({ data }: { data: Array<{ label: string; revenue: number; collections: number }> }) {
  if (!data.some((item) => item.revenue || item.collections)) return <div className="flex h-full items-center justify-center text-xs text-slate-500">No invoiced or collection activity in this period.</div>;
  return <div className="h-full w-full" role="img" aria-label="Invoiced amount and collections trend"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={18} /><YAxis tickFormatter={money} tick={{ fontSize: 10 }} width={64} /><Tooltip formatter={(value, name) => [money(Number(value)), name === "revenue" ? "Invoiced" : "Collections"]} /><Legend formatter={(value) => value === "revenue" ? "Invoiced" : "Collections"} /><Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2} /><Area type="monotone" dataKey="collections" stroke="#059669" fill="#059669" fillOpacity={0.10} strokeWidth={2} /></AreaChart></ResponsiveContainer></div>;
}
