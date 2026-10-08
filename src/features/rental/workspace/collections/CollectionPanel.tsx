import { useCollectionSummary } from "./useCollectionSummary";
import CollectionMetricCard from "./CollectionMetricCard";
import { formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";
import { useCollectionRecorder } from "./useCollectionRecorder";

export default function CollectionPanel() {
  const collection=useCollectionSummary();
  const status=projectRentalCollectionStatus({hasStatement:collection.hasStatement,totalInvoiced:collection.invoiceTotal,totalCollected:collection.totalCollected,outstandingBalance:collection.outstanding});
  const recorder = useCollectionRecorder();
  return <div className="space-y-5">
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      <CollectionMetricCard label="Collection Status" value={status.status}/>
      <CollectionMetricCard label="Total Invoiced" value={formatPhpCurrency(collection.invoiceTotal)}/>
      <CollectionMetricCard label="Collected" value={formatPhpCurrency(collection.totalCollected)}/>
      <CollectionMetricCard label="Outstanding" value={formatPhpCurrency(collection.outstanding)}/>
      <CollectionMetricCard label="Collections" value={collection.collectionCount.toString()}/>
    </div>
    {recorder.available && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Record Collection</h2><p className="mt-1 text-sm text-slate-500">Duplicate collection references are rejected.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-sm">Amount<input className="mt-1 w-full rounded border p-2" type="number" min="0.01" step="0.01" value={recorder.amount} onChange={(event)=>recorder.setAmount(event.target.value)} /></label><label className="text-sm">Payment date<input className="mt-1 w-full rounded border p-2" type="date" value={recorder.paymentDate} onChange={(event)=>recorder.setPaymentDate(event.target.value)} /></label><label className="text-sm">Reference<input className="mt-1 w-full rounded border p-2" value={recorder.reference} onChange={(event)=>recorder.setReference(event.target.value)} /></label></div><button type="button" className="mt-4 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={recorder.busy} onClick={()=>void recorder.submit()}>{recorder.busy?"Recording…":"Record Collection"}</button>{recorder.message&&<p className="mt-3 text-sm" role="status">{recorder.message}</p>}</section>}
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Collection History</h2>{collection.history.length===0?<p className="mt-3 text-sm text-slate-500">No Collection transactions have been recorded.</p>:<div className="mt-3 space-y-2">{collection.history.map(item=><article className="rounded border p-3 text-sm" key={item.id}><strong>{formatPhpCurrency(item.amount)}</strong><p>{item.paymentDate} · Reference {item.referenceNumber}{item.paymentMethod?` · ${item.paymentMethod}`:""}</p><p>Recorded by {item.recordedBy}{item.remarks?` · ${item.remarks}`:""}</p></article>)}</div>}</section>
  </div>;
}
