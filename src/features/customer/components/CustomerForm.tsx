import { useState } from "react";

import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import {
  normalizeCustomerContact,
  validateCustomerContact,
  validateCustomerEmail,
} from "../services/customerService";

export interface CustomerFormData {
  companyName: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  active: boolean;
}

interface Props {
  initialData?: CustomerFormData & { customerCode?: string };
  onSubmit(data: CustomerFormData): void | Promise<void>;
}

export default function CustomerForm({ initialData, onSubmit }: Props) {
  const submission=useFormSubmission("Customer",onSubmit);
  const [form, setForm] = useState<CustomerFormData>(initialData ?? {
    companyName: "", contactPerson: "", contactNumber: "", email: "", address: "", active: true,
  });
  const [errors, setErrors] = useState<{ contactNumber?: string; email?: string }>({});

  function update(key: keyof CustomerFormData, value: string | boolean) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <form className="max-w-2xl space-y-5 p-8" onSubmit={(event) => {
      event.preventDefault();
      const contactNumber = normalizeCustomerContact(form.contactNumber);
      const email = form.email.trim();
      const contactError = validateCustomerContact(contactNumber);
      const emailError = validateCustomerEmail(email);
      setErrors({ contactNumber: contactError, email: emailError });
      if (contactError || emailError) {
        submission.fail(contactError || emailError || "Unable to save Customer.");
        return;
      }
      void submission.submit({ ...form, contactNumber, email });
    }}>
      {submission.feedback}
      {initialData?.customerCode && <Input label="Customer Code" value={initialData.customerCode} readOnly />}
      <Input label="Company Name" value={form.companyName} onChange={(event) => update("companyName", event.target.value)} />
      <Input label="Contact Person" value={form.contactPerson} onChange={(event) => update("contactPerson", event.target.value)} />
      <Input label="Contact Number" type="tel" value={form.contactNumber} error={errors.contactNumber} onChange={(event) => update("contactNumber", event.target.value)} />
      <Input label="Email" type="email" value={form.email} error={errors.email} onChange={(event) => update("email", event.target.value)} />
      <Input label="Address" value={form.address} onChange={(event) => update("address", event.target.value)} />
      <Button type="submit" disabled={submission.busy}>{submission.busy?"Saving...":"Save Customer"}</Button>
    </form>
  );
}
