import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRental } from "@/features/rental/context/RentalContext";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseLegacyRentalMutations, REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/rental/services/rentalRuntimeCapability";

export default function RentalCustomerContactPage() {
  const dependencies = useApplicationDependenciesCompatibility();
  const { configuration } = dependencies;
  const mutationsAvailable = canUseLegacyRentalMutations(configuration);
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  const { rentalId = "" } = useParams();
  const { getRental, updateCustomerContact } = useRental();
  const rental = getRental(rentalId);
  const contact = rental?.customerContactSnapshot;
  const [name, setName] = useState(contact?.representativeName ?? "");
  const [email, setEmail] = useState(contact?.representativeEmail ?? "");
  const [designation, setDesignation] = useState(contact?.designation ?? "");
  const [phone, setPhone] = useState(contact?.contactNumber ?? "");
  const [message, setMessage] = useState("");
  const [saving,setSaving]=useState(false);
  const identity=useRef<{commandId:string;idempotencyKey:string}|undefined>(undefined);
  if (!rental) return <main className="p-8">Rental not found.</main>;
  if (!mutationsAvailable && !remote) return <main className="p-8"><Link className="text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><p className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">{REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE}</p></main>;
  if (rental.status === "Closed") return <main className="p-8"><Link className="text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><p className="mt-4 rounded bg-slate-100 p-4">This Rental has been closed. Historical records are read-only.</p></main>;
  return <main className="mx-auto max-w-xl space-y-4 p-6">
    <Link className="text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link>
    <h1 className="text-2xl font-bold">Edit Customer Contact</h1>
    <p>{rental.rentalNumber ?? "Rental"} · This recipient is specific to this Rental.</p>
    <section className="space-y-3 rounded border bg-white p-5">
      <label className="block">Representative Name<input className="block w-full rounded border p-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block">Representative Email<input className="block w-full rounded border p-2" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="block">Designation / Role<input className="block w-full rounded border p-2" value={designation} onChange={(event) => setDesignation(event.target.value)} /></label>
      <label className="block">Contact Number<input className="block w-full rounded border p-2" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={async () => {
        if (remote) {
          const repository=dependencies.commandRepositories.canonicalRental;
          if(!repository?.configureCustomerReview||rental.rowVersion===undefined||!rental.customerId){setMessage("Canonical Customer Review configuration is unavailable. Refresh and try again.");return;}
          const command=identity.current??={commandId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};setSaving(true);
          const result=await repository.configureCustomerReview({...command,rentalId:rental.id,customerId:rental.customerId,expectedVersion:rental.rowVersion,representativeName:name,representativeEmail:email});
          setSaving(false);if(result.success||result.code!=="TRANSPORT_FAILURE")identity.current=undefined;setMessage(result.success ? "Customer review recipient and canonical timezone saved." : result.message); return;
        }
        const result = updateCustomerContact(rental.id, { representativeName: name, representativeEmail: email, designation, contactNumber: phone });
        setMessage(result.success ? "Customer contact saved. Existing request recipients were not changed." : result.message ?? "Unable to save.");
      }}>{saving?"Saving…":"Save Customer Contact"}</button>
      {message && <p role="status">{message}</p>}
    </section>
  </main>;
}
