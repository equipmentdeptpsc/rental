import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { operatorEditHref } from "@/features/operators/routing";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { billingWorkspaceHref } from "@/features/rental/workspace/routing";

interface SearchResult { type: string; id: string; title: string; subtitle: string; href: string }

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const { equipment } = useEquipment(); const { operators } = useOperator();
  const { customers } = useCustomer(); const { projects } = useProject();
  const results = useMemo<SearchResult[]>(() => {
    const keyword = query.trim().toLowerCase(); if (!keyword) return [];
    return [
      ...equipment.filter(e => `${e.assetNo} ${e.equipmentName} ${e.category} ${e.subcategoryName ?? ""}`.toLowerCase().includes(keyword)).map(e => ({ type: "Equipment", id: e.id, title: e.equipmentName, subtitle: e.assetNo, href: `/equipment/${e.id}` })),
      ...operators.filter(o => `${o.name} ${o.licenseNumber} ${o.email}`.toLowerCase().includes(keyword)).map(o => ({ type: "Operator", id: o.id, title: o.name, subtitle: o.licenseNumber, href: operatorEditHref(o.id) })),
      ...customers.filter(c => `${c.companyName} ${c.customerCode} ${c.contactPerson}`.toLowerCase().includes(keyword)).map(c => ({ type: "Customer", id: c.id, title: c.companyName, subtitle: c.customerCode, href: `/customers/${c.id}` })),
      ...projects.filter(p => `${p.projectName} ${p.projectCode}`.toLowerCase().includes(keyword)).map(p => ({ type: "Project", id: p.id, title: p.projectName, subtitle: p.projectCode, href: `/projects/${p.id}/edit` })),
      ...billingStatementRepository.search(keyword).map(s => ({ type: "Billing", id: s.id, title: s.statementNo, subtitle: `${s.customer} · ${s.project}`, href: billingWorkspaceHref(s.rentalId, s.id) })),
    ];
  }, [query, equipment, operators, customers, projects]);
  const groups = Object.entries(results.reduce<Record<string, SearchResult[]>>((all, result) => { (all[result.type] ??= []).push(result); return all; }, {}));
  return <div className="relative"><input aria-label="Global keyword search" className="w-full rounded-lg border p-2 text-sm" placeholder="Search equipment, operators, customers, projects, billing…" value={query} onChange={e => setQuery(e.target.value)} />{query && <div className="absolute right-0 z-50 mt-1 max-h-96 w-full min-w-[340px] overflow-auto rounded border bg-white p-3 shadow-xl">{results.length === 0 ? <p className="text-sm text-slate-500">No results found.</p> : groups.map(([type, items]) => <section key={type} className="mb-3"><h3 className="text-xs font-semibold uppercase text-slate-500">{type}</h3>{items.map(item => <Link key={`${item.type}:${item.id}`} className="block rounded p-2 hover:bg-slate-100" to={item.href} onClick={() => setQuery("")}><strong className="text-sm">{item.title}</strong><p className="text-xs text-slate-500">{item.subtitle}</p></Link>)}</section>)}</div>}</div>;
}
