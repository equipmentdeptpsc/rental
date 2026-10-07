import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BuiltReport } from "../services/reportBuilderService";

export default function ReportChart({ report }: { report: BuiltReport }) {
  const data = report.metrics
    .filter((metric) => metric.numericValue !== undefined)
    .map((metric) => ({ name: metric.label, Current: metric.numericValue, Previous: metric.previousValue }));
  if (!data.length) return null;

  return (
    <section className="app-card p-4">
      <h3 className="font-semibold">Report Visualization</h3>
      <p className="mb-3 text-xs text-slate-500">Blue shows the current result; purple shows the selected comparison where available.</p>
      <div className="h-72" aria-label="Current and comparison report chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Current" fill="#2563eb" radius={[4, 4, 0, 0]} />
            {data.some((item) => item.Previous !== undefined) && <Bar dataKey="Previous" fill="#7c3aed" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Chart data</caption>
        <tbody>{data.map((item) => <tr key={item.name}><th>{item.name}</th><td>{item.Current}</td><td>{item.Previous ?? "No comparison"}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
