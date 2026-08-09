import { useCollectionSummary } from "./useCollectionSummary";
import CollectionMetricCard from "./CollectionMetricCard";
import { formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";

export default function CollectionPanel() {
  const collection=useCollectionSummary();
  const status=projectRentalCollectionStatus({hasStatement:collection.hasStatement,totalInvoiced:collection.invoiceTotal,totalCollected:collection.totalCollected,outstandingBalance:collection.outstanding});
  return <div className="space-y-5">
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      <CollectionMetricCard label="Collection Status" value={status.status}/>
      <CollectionMetricCard label="Total Invoiced" value={formatPhpCurrency(collection.invoiceTotal)}/>
      <CollectionMetricCard label="Collected" value={formatPhpCurrency(collection.totalCollected)}/>
      <CollectionMetricCard label="Outstanding" value={formatPhpCurrency(collection.outstanding)}/>
      <CollectionMetricCard label="Collections" value={collection.collectionCount.toString()}/>
    </div>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Collection History</h2>{collection.history.length===0?<p className="mt-3 text-sm text-slate-500">No Collection transactions have been recorded.</p>:<div className="mt-3 space-y-2">{collection.history.map(item=><article className="rounded border p-3 text-sm" key={item.id}><strong>{formatPhpCurrency(item.amount)}</strong><p>{item.paymentDate} · Reference {item.referenceNumber}{item.paymentMethod?` · ${item.paymentMethod}`:""}</p><p>Recorded by {item.recordedBy}{item.remarks?` · ${item.remarks}`:""}</p></article>)}</div>}</section>
  </div>;
}
