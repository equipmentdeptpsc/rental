import {
    useCollectionSummary,
  } from "./useCollectionSummary";
  
  import CollectionMetricCard from "./CollectionMetricCard";
  
  export default function CollectionPanel() {
    const collection =
      useCollectionSummary();
  
    return (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
  
        <CollectionMetricCard
          label="Collections"
          value={
            collection.collectionCount.toString()
          }
        />
  
        <CollectionMetricCard
          label="Collected"
          value={`₱ ${collection.totalCollected.toLocaleString()}`}
        />
  
        <CollectionMetricCard
          label="Outstanding"
          value={`₱ ${collection.outstanding.toLocaleString()}`}
        />
  
        <CollectionMetricCard
          label="Latest Reference"
          value={
            collection.latestReferenceNo ??
            "-"
          }
        />
  
      </div>
    );
  }