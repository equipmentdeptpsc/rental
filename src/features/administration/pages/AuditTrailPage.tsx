import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { useApplicationDependencies } from "@/app/composition";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { AuthorizationAuditService } from "../services/AuthorizationAuditService";
import { CanonicalRoleAdministrationService } from "../services/CanonicalRoleAdministrationService";
import { presentAuditEvent } from "../services/auditPresentation";
import type { CanonicalAuditEvent } from "../domain/canonicalAudit";

const localTime = (iso: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
type Row = { event: CanonicalAuditEvent; actionLabel: string; actor: { primary: string; secondary: string; technicalId: string }; target: { primary: string; secondary: string; technicalId: string }; details: string[]; searchText: string };

function remoteRow(event: CanonicalAuditEvent): Row {
  const actionLabel = event.action.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const actor = event.actorName?.trim() || event.actorId || "System";
  return { event, actionLabel, actor: { primary: actor, secondary: event.actorId ? "Authenticated actor" : "System actor", technicalId: event.actorId ?? "Unavailable" }, target: { primary: event.aggregateType, secondary: event.aggregateId, technicalId: event.aggregateId }, details: event.correlationId ? [`Correlation: ${event.correlationId}`] : [], searchText: `${actionLabel} ${event.action} ${actor} ${event.aggregateType} ${event.aggregateId}`.toLowerCase() };
}

export default function AuditTrailPage() {
  const dependencies = useApplicationDependencies();
  const remote = dependencies.configuration.persistenceMode === "remote";
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(remote ? "loading" : "loaded");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!remote) {
      const users = new LocalUserRepository();
      const roles = new CanonicalRoleAdministrationService(undefined, users).listRoles();
      const events = new AuthorizationAuditService().all().map((event) => ({ ...event, aggregateType: event.targetType, aggregateId: event.targetId }));
      setRows(events.map((event) => { const presentation = presentAuditEvent(event as never, users.getUsers(), roles); return { event, actionLabel: presentation.actionLabel, actor: presentation.actor, target: presentation.target, details: presentation.details, searchText: presentation.searchText }; }));
      return () => { cancelled = true; };
    }
    void Promise.resolve(dependencies.readRepositories.canonicalAudit.list({ ordering: [{ field: "occurred_at", ascending: false }] })).then((result) => {
      if (cancelled) return;
      if (!result.success) { setStatus("error"); setError(result.error.message); return; }
      setRows(result.value.items.map(remoteRow)); setStatus("loaded");
    }).catch(() => { if (!cancelled) { setStatus("error"); setError("Canonical audit events could not be loaded."); } });
    return () => { cancelled = true; };
  }, [dependencies, remote]);

  const [search, setSearch] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [action, setAction] = useState("all"), [actor, setActor] = useState("all"), [target, setTarget] = useState(""), [pageSize, setPageSize] = useState(20), [page, setPage] = useState(1);
  const actions = useMemo(() => [...new Set(rows.map((x) => x.event.action))].sort(), [rows]);
  const actors = useMemo(() => [...new Map(rows.map((x) => [x.event.actorId ?? "system", x.actor])).entries()].sort((a, b) => a[1].primary.localeCompare(b[1].primary)), [rows]);
  const filtered = rows.filter(({ event, searchText, actor: identity, target: targetIdentity }) => { const day = event.occurredAt.slice(0, 10); return (!search || searchText.includes(search.trim().toLowerCase())) && (!from || day >= from) && (!to || day <= to) && (action === "all" || event.action === action) && (actor === "all" || (event.actorId ?? "system") === actor) && (!target || `${targetIdentity.primary} ${targetIdentity.secondary} ${targetIdentity.technicalId}`.toLowerCase().includes(target.toLowerCase())) && identity; }).sort((a, b) => b.event.occurredAt.localeCompare(a.event.occurredAt) || b.event.id.localeCompare(a.event.id));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), safePage = Math.min(page, pages), start = (safePage - 1) * pageSize, shown = filtered.slice(start, start + pageSize);
  const clear = () => { setSearch(""); setFrom(""); setTo(""); setAction("all"); setActor("all"); setTarget(""); setPage(1); };
  return <main className="app-page"><header><h1 className="text-2xl font-bold">Authorization Audit Trail</h1><p className="text-slate-500">Who changed what, to whom, and when. Immutable IDs remain available as secondary evidence.</p></header><section aria-label="Audit filters" className="app-card grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6"><label htmlFor="audit-search">Search<input id="audit-search" aria-label="Search audit identities and events" className="app-control mt-1 block w-full" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label><label htmlFor="audit-from">Date From<input id="audit-from" type="date" className="app-control mt-1 block w-full" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label><label htmlFor="audit-to">Date To<input id="audit-to" type="date" className="app-control mt-1 block w-full" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label><label htmlFor="audit-action">Action<select id="audit-action" className="app-control mt-1 block w-full" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="all">All Actions</option>{actions.map((x) => <option value={x} key={x}>{x.replaceAll("_", " ")}</option>)}</select></label><label htmlFor="audit-actor">Actor<select id="audit-actor" className="app-control mt-1 block w-full" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }}><option value="all">All Actors</option>{actors.map(([id, identity]) => <option value={id} key={id}>{identity.primary} ({identity.secondary})</option>)}</select></label><label htmlFor="audit-target">Target<input id="audit-target" className="app-control mt-1 block w-full" value={target} onChange={(e) => { setTarget(e.target.value); setPage(1); }} /></label><Button variant="secondary" className="md:self-end" onClick={clear}>Clear Filters</Button></section>{status === "error" && <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}<div className="flex flex-wrap items-center justify-between gap-3"><p>{status === "loading" ? "Loading canonical audit events…" : `Showing ${filtered.length ? start + 1 : 0}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length} events`}</p><label htmlFor="audit-page-size">Rows per page<select id="audit-page-size" className="app-control ml-2" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>{[20, 50, 100].map((x) => <option key={x}>{x}</option>)}</select></label></div><ResponsiveTable><div className="app-card min-w-[900px] overflow-hidden"><table className="app-table w-full text-left text-sm"><thead><tr><th className="p-3">Date &amp; Time</th><th className="p-3">Action</th><th className="p-3">Actor</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead><tbody>{shown.map(({ event, actionLabel, actor: identity, target: targetIdentity, details }) => <tr className="align-top" key={event.id}><td className="p-3" title={event.occurredAt}>{localTime(event.occurredAt)}</td><td className="p-3"><b>{actionLabel}</b><code className="block text-xs text-slate-500">{event.action}</code></td><td className="p-3"><b className="block">{identity.primary}</b><span className="block">{identity.secondary}</span><code className="block text-xs text-slate-500">{identity.technicalId}</code></td><td className="p-3"><b className="block">{targetIdentity.primary}</b><span className="block">{targetIdentity.secondary}</span><code className="block text-xs text-slate-500">ID: {targetIdentity.technicalId}</code></td><td className="p-3">{details.map((detail, index) => <span className="block" key={index}>{detail}</span>)}</td></tr>)}</tbody></table>{status === "loaded" && !shown.length && <p className="p-6 text-center text-slate-500">No audit events match the selected filters.</p>}</div></ResponsiveTable><nav aria-label="Audit pagination" className="flex items-center justify-center gap-3"><Button variant="secondary" aria-label="Previous audit page" disabled={safePage <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))}>Previous</Button><span>Page {safePage} of {pages}</span><Button variant="secondary" aria-label="Next audit page" disabled={safePage >= pages} onClick={() => setPage((x) => Math.min(pages, x + 1))}>Next</Button></nav></main>;
}
