import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { requestCanonicalCustomerRefresh } from "@/features/customer/remote/canonicalCustomerRefresh";
import { normalizeCustomerContact, validateCustomerContact, validateCustomerEmail } from "@/features/customer/services/customerService";

export default function RemoteCustomerForm() {
  const { commandRepositories } = useApplicationDependenciesCompatibility(); const navigate = useNavigate();
  const [form, setForm] = useState({ customerCode: "", name: "", email: "", phone: "", address: "" });
  const identity = useRef<{ customerId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  const submission = useFormSubmission("Customer", async () => { const command = identity.current ??= { customerId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await commandRepositories.canonicalCustomer!.createCustomer({ ...command, customerCode: form.customerCode.trim(), name: form.name.trim(), email: form.email.trim() || undefined, phone: normalizeCustomerContact(form.phone) || undefined, address: form.address.trim() || undefined });
    if (!result.success) throw new Error(result.message); requestCanonicalCustomerRefresh(); navigate("/customers"); });
  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));
  return <div className="mx-auto max-w-3xl space-y-6 p-8"><div><h1 className="text-3xl font-bold">New Customer</h1><p className="mt-2 text-gray-500">Create a canonical Customer business record.</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); const emailError = validateCustomerEmail(form.email.trim()), phoneError = validateCustomerContact(normalizeCustomerContact(form.phone)); if (!form.customerCode.trim() || !form.name.trim() || emailError || phoneError) return submission.fail(emailError || phoneError || "Enter a Customer Code and Customer Name."); void submission.submit(undefined); }}>{submission.feedback}<Input label="Customer Code" required value={form.customerCode} onChange={(event) => update("customerCode", event.target.value)} /><Input label="Customer Name" required value={form.name} onChange={(event) => update("name", event.target.value)} /><Input label="Email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /><Input label="Contact Number" type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /><Input label="Address" value={form.address} onChange={(event) => update("address", event.target.value)} /><p className="text-sm text-slate-500">Customer login identities and contact-person records are not created by this command.</p><div className="flex justify-end"><Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : "Create Customer"}</Button></div></form></div>;
}
