import type { DeurRecord } from "../types";

export default function DeurRevisionCard({ deur, chain }: { deur: DeurRecord; chain: DeurRecord[] }) {
  const revision = deur.revision;
  if (!revision) return null;
  const supersededBy = chain.find((item) => item.id === revision.supersededByRevisionId);
  return (
    <section className="rounded-xl border bg-white p-5 text-sm">
      <h3 className="font-semibold">DEUR Revision {revision.revisionNumber}</h3>
      <p className="mt-1 text-slate-600">Status: {revision.supersededByRevisionId ? "Superseded" : deur.status}</p>
      {revision.correctionReasonCode && <p>Reason: {revision.correctionReasonCode.replaceAll("_", " ")}</p>}
      {revision.correctionReasonDetails && <p>Details: {revision.correctionReasonDetails}</p>}
      {revision.correctedByName && <p>Corrected by {revision.correctedByName}{revision.correctedAt ? ` on ${new Date(revision.correctedAt).toLocaleString()}` : ""}</p>}
      {supersededBy && <p>Superseded by revision {supersededBy.revision?.revisionNumber ?? supersededBy.id}</p>}
    </section>
  );
}
