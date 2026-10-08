import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import InteractiveTableRow from "@/components/ui/InteractiveTableRow";
import StatusBadge from "@/components/ui/StatusBadge";
import FilterBar from "@/components/ui/FilterBar";
import { getProjectDisplayLabel } from "@/features/project/projectDisplay";
import { canonicalBookingStatuses, type CanonicalBookingListItem, type CanonicalBookingPage, type CanonicalBookingSearchInput, type CanonicalBookingSort } from "../canonical";
import { bookingRentalWorkspacePath } from "../bookingOperationsPresentation";
import { bookingAttentionLabels, bookingDateRange, bookingMatchesKeyword, bookingOverlapsRange, bookingRangeError, businessDate, type BookingAttention, type BookingDatePreset } from "../bookingListModel";

const BookingDetailsDrawer = lazy(() => import("./BookingDetailsDrawer"));
type Option = { id: string; label: string; customerId?: string };
type Summary = { total: number; reserved: number; releases: number; returns: number };
type PageState = { status: "loading" | "error"; message?: string } | { status: "ready"; page: CanonicalBookingPage };
const optionLabel = (options: Option[], id: string, fallback: string) => options.find((option) => option.id === id)?.label ?? fallback;
const sortOptions: Array<[CanonicalBookingSort, string]> = [["createdAt", "Booking / Created"], ["dateOut", "Start / Release"], ["expectedReturn", "Expected Return"], ["rentalStatus", "Status"]];

export default function CanonicalBookingListWorkspace() {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = businessDate();
  const param = (key: string) => params.get(`b_${key}`) ?? "";
  const preset = (["today", "week", "next7", "month", "custom"].includes(param("preset")) ? param("preset") : "week") as BookingDatePreset;
  const { from, to } = bookingDateRange(preset, today, param("from"), param("to"));
  const rangeError = bookingRangeError(from, to);
  const pageNumber = Math.max(1, Number(param("page")) || 1);
  const sort = sortOptions.find(([value]) => value === param("sort"))?.[0] ?? "dateOut";
  const ascending = param("direction") !== "desc";
  const status = canonicalBookingStatuses.find((value) => value === param("status"));
  const attention = (["release", "return"].includes(param("attention")) ? param("attention") : "") as BookingAttention | "";
  const [queryInput, setQueryInput] = useState(param("q"));
  const [options, setOptions] = useState<{ customers: Option[]; projects: Option[]; equipment: Option[] }>({ customers: [], projects: [], equipment: [] });
  const [optionSearch, setOptionSearch] = useState({ customer: "", project: "", equipment: "" });
  const [optionSearchReady, setOptionSearchReady] = useState(optionSearch);
  const [moreOptions, setMoreOptions] = useState({ customer: false, project: false, equipment: false });
  const [page, setPage] = useState<PageState>({ status: "loading" });
  const [summary, setSummary] = useState<Summary>();
  const [hasAnyBooking, setHasAnyBooking] = useState<boolean>();
  const [selectedRow, setSelectedRow] = useState<CanonicalBookingListItem>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const update = (key: string, value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    value ? next.set(`b_${key}`, value) : next.delete(`b_${key}`);
    next.delete("b_page");
    return next;
  }, { replace: true });
  const goToPage = (value: number) => setParams((current) => {
    const next = new URLSearchParams(current);
    value > 1 ? next.set("b_page", String(value)) : next.delete("b_page");
    return next;
  }, { replace: true });
  const updateRange = (key: "from" | "to", value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    next.set("b_preset", "custom");
    next.set("b_from", key === "from" ? value : from);
    next.set("b_to", key === "to" ? value : to);
    next.delete("b_page");
    return next;
  }, { replace: true });
  const setSort = (value: CanonicalBookingSort) => setParams((current) => {
    const next = new URLSearchParams(current);
    next.set("b_sort", value);
    next.set("b_direction", sort === value && ascending ? "desc" : "asc");
    next.delete("b_page");
    return next;
  }, { replace: true });
  const setStatus = (value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    value ? next.set("b_status", value) : next.delete("b_status");
    next.delete("b_attention");
    next.delete("b_page");
    return next;
  }, { replace: true });
  const clear = () => { setQueryInput(""); setParams((current) => {
    const next = new URLSearchParams(current);
    for (const key of [...next.keys()]) if (key.startsWith("b_")) next.delete(key);
    return next;
  }, { replace: true }); };

  const queryParam = param("q");
  useEffect(() => { setQueryInput(queryParam); }, [queryParam]);
  useEffect(() => {
    if (queryInput === queryParam) return;
    const timer = window.setTimeout(() => update("q", queryInput), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput, queryParam]);

  const canReadCustomer = hasPermission("customer.read");
  const canReadProject = hasPermission("project.read");
  const canReadEquipment = hasPermission("equipment.read");
  const selectedCustomerId = param("customer"), selectedProjectId = param("project"), selectedEquipmentId = param("equipment");
  useEffect(() => { const timer = window.setTimeout(() => setOptionSearchReady(optionSearch), 250); return () => window.clearTimeout(timer); }, [optionSearch]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      canReadCustomer ? optionSearchReady.customer ? readRepositories.customers.search(optionSearchReady.customer, { paging: { limit: 100 }, ordering: [{ field: "name", ascending: true }] }) : readRepositories.customers.list({ paging: { limit: 100 }, ordering: [{ field: "name", ascending: true }] }) : Promise.resolve(null),
      canReadProject ? optionSearchReady.project ? readRepositories.projects.search(optionSearchReady.project, { paging: { limit: 100 }, ordering: [{ field: "name", ascending: true }] }) : readRepositories.projects.list({ paging: { limit: 100 }, ordering: [{ field: "name", ascending: true }] }) : Promise.resolve(null),
      canReadEquipment ? optionSearchReady.equipment ? readRepositories.equipment.search(optionSearchReady.equipment, { paging: { limit: 100 }, ordering: [{ field: "asset_no", ascending: true }] }) : readRepositories.equipment.list({ paging: { limit: 100 }, ordering: [{ field: "asset_no", ascending: true }] }) : Promise.resolve(null),
    ]).then(async ([customers, projects, equipment]) => {
      if (!active) return;
      const customerItems = customers?.success ? customers.value.items : [];
      const projectItems = projects?.success ? projects.value.items : [];
      const equipmentItems = equipment?.success ? equipment.value.items : [];
      const [selectedCustomer, selectedProject, selectedEquipment] = await Promise.all([
        canReadCustomer && selectedCustomerId && !customerItems.some((item) => item.id === selectedCustomerId) ? readRepositories.customers.getById(selectedCustomerId) : Promise.resolve(null),
        canReadProject && selectedProjectId && !projectItems.some((item) => item.id === selectedProjectId) ? readRepositories.projects.getById(selectedProjectId) : Promise.resolve(null),
        canReadEquipment && selectedEquipmentId && !equipmentItems.some((item) => item.id === selectedEquipmentId) ? readRepositories.equipment.getById(selectedEquipmentId) : Promise.resolve(null),
      ]);
      if (!active) return;
      setMoreOptions({ customer: Boolean(customers?.success && customers.value.nextCursor), project: Boolean(projects?.success && projects.value.nextCursor), equipment: Boolean(equipment?.success && equipment.value.nextCursor) });
      setOptions({
        customers: [...customerItems, ...(selectedCustomer?.success && selectedCustomer.value ? [selectedCustomer.value] : [])].map((item) => ({ id: item.id, label: item.companyName })),
        projects: [...projectItems, ...(selectedProject?.success && selectedProject.value ? [selectedProject.value] : [])].map((item) => ({ id: item.id, label: getProjectDisplayLabel(item), customerId: item.customerId })),
        equipment: [...equipmentItems, ...(selectedEquipment?.success && selectedEquipment.value ? [selectedEquipment.value] : [])].map((item) => ({ id: item.id, label: `${item.assetNo} · ${item.equipmentName}` })),
      });
    }).catch(() => { if (active) setOptions({ customers: [], projects: [], equipment: [] }); });
    return () => { active = false; };
  }, [readRepositories, canReadCustomer, canReadProject, canReadEquipment, selectedCustomerId, selectedProjectId, selectedEquipmentId, optionSearchReady]);

  const searchInput: CanonicalBookingSearchInput = {
    ...(status && !attention ? { status } : {}),
    customerId: param("customer") || undefined,
    projectId: param("project") || undefined,
    equipmentId: param("equipment") || undefined,
    sort, ascending,
  };
  const searchKey = JSON.stringify({ from, to, ...searchInput, attention, query: param("q"), pageNumber });
  useEffect(() => {
    if (rangeError) { setPage({ status: "error", message: rangeError }); return; }
    let active = true;
    setPage({ status: "loading" });
    const input = { ...searchInput, windowStart: from, windowEnd: to };
    const searchPage = (offset: number, limit: number) => attention === "release"
      ? readRepositories.canonicalBookings.searchCanonicalUpcomingReleaseRows({ ...input, offset, limit })
      : attention === "return"
        ? readRepositories.canonicalBookings.searchCanonicalExpectedReturnRows({ ...input, offset, limit })
        : readRepositories.canonicalBookings.searchCanonicalBookingCalendarRows({ ...input, offset, limit });
    void (async () => {
      const query = param("q").trim();
      if (!query) {
        const result = await searchPage((pageNumber - 1) * 50, 50);
        if (active) setPage(result.success ? { status: "ready", page: result.value } : { status: "error", message: result.error.message });
        return;
      }
      const allRows: CanonicalBookingListItem[] = [];
      for (let offset = 0; offset < 2000; offset += 100) {
        const result = await searchPage(offset, 100);
        if (!active) return;
        if (!result.success) { setPage({ status: "error", message: result.error.message }); return; }
        allRows.push(...result.value.rows);
        if (!result.value.hasMore) {
          const matches = allRows.filter((row) => bookingOverlapsRange(row, from, to) && bookingMatchesKeyword(row, query));
          setPage({ status: "ready", page: { rows: matches.slice((pageNumber - 1) * 50, pageNumber * 50), totalCount: matches.length, limit: 50, offset: (pageNumber - 1) * 50, hasMore: pageNumber * 50 < matches.length } });
          return;
        }
      }
      setPage({ status: "error", message: "Too many bookings to search in this range. Narrow the dates or choose a customer, project, or equipment." });
    })().catch(() => { if (active) setPage({ status: "error", message: "Bookings could not be loaded." }); });
    return () => { active = false; };
  }, [readRepositories.canonicalBookings, searchKey, rangeError]);

  const summaryKey = JSON.stringify({ from, to, customerId: searchInput.customerId, projectId: searchInput.projectId, equipmentId: searchInput.equipmentId });
  useEffect(() => {
    if (rangeError) return;
    let active = true;
    setSummary(undefined);
    const scope = { windowStart: from, windowEnd: to, customerId: searchInput.customerId, projectId: searchInput.projectId, equipmentId: searchInput.equipmentId, offset: 0, limit: 1 };
    void Promise.all([
      readRepositories.canonicalBookings.searchCanonicalBookingCalendarRows(scope),
      readRepositories.canonicalBookings.searchCanonicalBookingCalendarRows({ ...scope, status: "Reserved" }),
      readRepositories.canonicalBookings.searchCanonicalUpcomingReleaseRows(scope),
      readRepositories.canonicalBookings.searchCanonicalExpectedReturnRows(scope),
    ]).then(([total, reserved, releases, returns]) => {
      if (active && total.success && reserved.success && releases.success && returns.success) setSummary({ total: total.value.totalCount, reserved: reserved.value.totalCount, releases: releases.value.totalCount, returns: returns.value.totalCount });
    });
    return () => { active = false; };
  }, [readRepositories.canonicalBookings, summaryKey, rangeError]);

  useEffect(() => {
    if (page.status !== "ready" || page.page.totalCount || hasAnyBooking !== undefined) return;
    let active = true;
    void readRepositories.canonicalBookings.searchCanonicalBookingRows({ limit: 1 }).then((result) => { if (active && result.success) setHasAnyBooking(result.value.totalCount > 0); });
    return () => { active = false; };
  }, [page, readRepositories.canonicalBookings, hasAnyBooking]);

  const customerOptions = options.customers;
  const projectOptions = options.projects.filter((item) => !param("customer") || item.customerId === param("customer"));
  const chips = [
    ["customer", param("customer"), optionLabel(customerOptions, param("customer"), "Customer")],
    ["project", param("project"), optionLabel(options.projects, param("project"), "Project")],
    ["equipment", param("equipment"), optionLabel(options.equipment, param("equipment"), "Equipment")],
    ["status", param("status"), param("status")],
    ["attention", param("attention"), attention === "release" ? "Releases due" : "Returns due"],
    ["q", param("q"), param("q")],
  ].filter(([, value]) => Boolean(value));
  const rows = page.status === "ready" ? page.page.rows : [];
  const total = page.status === "ready" ? page.page.totalCount : 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const noOtherFilters = !param("customer") && !param("project") && !param("equipment") && !param("status") && !param("attention") && !param("q");
  const emptyTitle = hasAnyBooking === false ? "No bookings yet" : noOtherFilters ? "No bookings in the selected dates" : "No bookings match these filters";
  const openRow = (row: CanonicalBookingListItem) => { setSelectedRow(row); setDrawerOpen(true); };
  const summaryCards: Array<{ key: string; title: string; count: number; help: string }> = summary ? [
    { key: "total", title: "Total Bookings", count: summary.total, help: "Equipment-line bookings overlapping these dates" },
    { key: "reserved", title: "Equipment Reserved", count: summary.reserved, help: "Reserved equipment lines in this range" },
    { key: "release", title: "Releases Due", count: summary.releases, help: "Approved, reserved equipment scheduled for release" },
    { key: "return", title: "Returns Due", count: summary.returns, help: "Released or active equipment expected back" },
  ] : [];
  const select = (label: string, key: "customer" | "project" | "equipment", values: Option[], permitted = true) => permitted && <div className="text-xs font-medium text-slate-600 dark:text-slate-300"><label htmlFor={`booking-${key}`}>{label}</label>{(moreOptions[key] || optionSearch[key]) && <input aria-label={`Find ${label.toLowerCase()}`} className="app-control mt-1 w-full" value={optionSearch[key]} onChange={(event) => setOptionSearch((current) => ({ ...current, [key]: event.target.value }))} placeholder={`Find ${label.toLowerCase()}`} />}<select id={`booking-${key}`} aria-label={label} className="app-control mt-1 w-full" value={param(key)} onChange={(event) => update(key, event.target.value)}><option value="">All {label.toLowerCase()}</option>{values.map((item) => <option className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100" key={item.id} value={item.id}>{item.label}</option>)}</select></div>;
  return <div className="space-y-4">
    <section aria-label="Booking summary" className="grid grid-cols-2 gap-2 lg:grid-cols-4">{summaryCards.map((card) => <button key={card.key} type="button" title={card.help} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.delete("b_status"); next.delete("b_attention"); if (card.key === "reserved") next.set("b_status", "Reserved"); if (card.key === "release" || card.key === "return") next.set("b_attention", card.key); next.delete("b_page"); return next; }, { replace: true })} className={`app-card border p-3 text-left hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-slate-800 ${param("attention") === card.key || card.key === "reserved" && param("status") === "Reserved" ? "border-blue-500" : ""}`}><span className="block text-xs text-slate-500">{card.title}</span><strong className="mt-1 block text-xl">{card.count}</strong></button>)}</section>
    <FilterBar onClear={clear} canClear={chips.length > 0 || preset !== "week"}><div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><label className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">Search bookings<input aria-label="Search bookings" className="app-control mt-1 w-full" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Rental no., equipment, customer, project" /></label>{select("Customer", "customer", customerOptions, canReadCustomer)}{select("Project", "project", projectOptions, canReadProject)}{select("Equipment", "equipment", options.equipment, canReadEquipment)}<label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status<select aria-label="Status" className="app-control mt-1 w-full" value={param("status")} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{canonicalBookingStatuses.map((value) => <option className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100" key={value} value={value}>{value}</option>)}</select></label><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Date scope<select aria-label="Date scope" className="app-control mt-1 w-full" value={preset} onChange={(event) => update("preset", event.target.value)}><option value="today">Today</option><option value="week">This Week</option><option value="next7">Next 7 Days</option><option value="month">This Month</option><option value="custom">Custom Range</option></select></label><label className="text-xs font-medium text-slate-600 dark:text-slate-300">From<input aria-label="From" type="date" className="app-control mt-1 w-full" value={from} onChange={(event) => updateRange("from", event.target.value)} /></label><label className="text-xs font-medium text-slate-600 dark:text-slate-300">To<input aria-label="To" type="date" className="app-control mt-1 w-full" value={to} onChange={(event) => updateRange("to", event.target.value)} /></label><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Sort by<select aria-label="Sort by" className="app-control mt-1 w-full" value={sort} onChange={(event) => setSort(event.target.value as CanonicalBookingSort)}>{sortOptions.map(([value, label]) => <option className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100" key={value} value={value}>{label}</option>)}</select></label></div></FilterBar>
    {chips.length > 0 && <div className="flex flex-wrap gap-2 text-xs" aria-label="Active booking filters">{chips.map(([key, , label]) => <button key={key} type="button" className="rounded-full border px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { if (key === "q") setQueryInput(""); update(key, ""); }}>{key === "q" ? "Search" : key}: {label} ×</button>)}</div>}
    {rangeError && <p role="alert" className="text-sm text-rose-700">{rangeError}</p>}
    {page.status === "loading" && <p role="status" className="app-card p-6 text-sm text-slate-500">Loading bookings…</p>}
    {page.status === "error" && !rangeError && <p role="alert" className="app-card p-6 text-sm text-rose-700">{page.message}</p>}
    {page.status === "ready" && <><div className="max-h-[70vh] min-w-0 w-full overflow-auto rounded-lg"><div className="app-card min-w-[960px]"><table className="app-table w-full text-sm"><thead className="sticky top-0 z-10 bg-white dark:bg-slate-900"><tr>{[["Booking / Rental", ""], ["Status", "rentalStatus"], ["Customer", ""], ["Project", ""], ["Equipment", ""], ["Start / Release", "dateOut"], ["Expected Return", "expectedReturn"], ["Attention", ""]].map(([title, order]) => <th className="px-3 py-2 text-left" key={title}>{order ? <button type="button" className="hover:text-blue-600" onClick={() => setSort(order as CanonicalBookingSort)}>{title}{sort === order ? ascending ? " ↑" : " ↓" : ""}</button> : title}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <InteractiveTableRow key={row.rentalEquipmentLineId} aria-label={`Open booking ${row.rentalNumber ?? "details"} for ${row.equipmentAssetNumber ?? row.equipmentName ?? "equipment"}`} selected={drawerOpen && selectedRow?.rentalEquipmentLineId === row.rentalEquipmentLineId} onOpen={() => openRow(row)}><td className="px-3 py-2 font-semibold">{row.rentalNumber ?? "Rental booking"}<span className="block text-xs font-normal text-slate-500">Equipment line · <Link className="text-blue-600 hover:underline" to={bookingRentalWorkspacePath(row.rentalId)}>Full workspace</Link></span></td><td className="px-3 py-2"><StatusBadge tone={row.rentalStatus === "Returned" || row.rentalStatus === "Closed" ? "success" : row.rentalStatus === "Active" ? "warning" : "info"}>{row.rentalStatus}</StatusBadge></td><td className="px-3 py-2">{row.customerName ?? "—"}</td><td className="px-3 py-2">{row.projectName ?? "—"}</td><td className="px-3 py-2">{row.equipmentAssetNumber ?? "Equipment"}<span className="block text-xs text-slate-500">{row.equipmentName ?? "—"}</span></td><td className="px-3 py-2">{row.dateOut.slice(0, 10)}</td><td className="px-3 py-2">{row.expectedReturn?.slice(0, 10) ?? "Open ended"}</td><td className="px-3 py-2 text-xs">{bookingAttentionLabels(row, today).map((text) => <span key={text} title={text} className="block font-medium text-amber-700 dark:text-amber-300">{text}</span>)}</td></InteractiveTableRow>) : <tr><td colSpan={8} className="p-8 text-center text-slate-500">{emptyTitle}</td></tr>}</tbody></table></div></div><div className="flex items-center justify-center gap-3 text-sm"><button type="button" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)}>Previous</button><span>Page {pageNumber} of {pages} · {total} equipment-line bookings</span><button type="button" disabled={pageNumber >= pages} onClick={() => goToPage(pageNumber + 1)}>Next</button></div></>}
    {selectedRow && <Suspense fallback={null}><BookingDetailsDrawer row={selectedRow} open={drawerOpen} onClose={() => setDrawerOpen(false)} /></Suspense>}
  </div>;
}
