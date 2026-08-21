import { useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useFormSubmission } from "@/components/form/useFormSubmission";

import type { Operator } from "../types";
import { normalizeOperatorCertifications } from "../services/operatorCertifications";

export interface OperatorFormData {
  name: string;
  email: string;
  licenseNumber: string;
  certificationType:
    | "Heavy Machinery"
    | "Forklift"
    | "Crane Logistics"
    | "None";
  certificationTypes: Array<"Heavy Machinery" | "Forklift" | "Crane Logistics">;
  status:
    | "Active"
    | "On Leave"
    | "Suspended";
  linkedUserId: string;
  pin: string;
  confirmPin: string;
}

interface Props {
  initialData?: Operator;
  initialLinkedUserId?: string;
  eligibleUsers?: readonly { id: string; displayName: string; username: string }[];
  requirePin?: boolean;

  onSubmit(data: OperatorFormData): void | Promise<void>;
}

export default function OperatorForm({
  initialData,
  initialLinkedUserId,
  eligibleUsers = [],
  requirePin = false,
  onSubmit,
}: Props) {
  const submission=useFormSubmission("Operator",onSubmit);
  const [form, setForm] =
    useState<OperatorFormData>({
      name:
        initialData?.name ?? "",

      email:
        initialData?.email ?? "",

      licenseNumber:
        initialData?.licenseNumber ??
        "",

      certificationType:
        initialData
          ?.certificationType ??
        "None",
      certificationTypes: initialData ? normalizeOperatorCertifications(initialData) : [],

      status:
        initialData?.status ??
        "Active",
      linkedUserId: initialLinkedUserId ?? "",
      pin: "",
      confirmPin: "",
    });

  function update<
    K extends keyof OperatorFormData
  >(
    key: K,
    value: OperatorFormData[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();
    void submission.submit(form);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
    >
      {submission.feedback}
      <Input
        label="Operator Name"
        required
        value={form.name}
        onChange={(e) =>
          update(
            "name",
            e.target.value
          )
        }
      />

      <Input
        label="Email (Optional)"
        type="email"
        value={form.email}
        onChange={(e) =>
          update(
            "email",
            e.target.value
          )
        }
      />

      <Input
        label="Operator Code / Employee ID"
        required
        value={form.licenseNumber}
        onChange={(e) =>
          update(
            "licenseNumber",
            e.target.value
          )
        }
      />

      <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">Certifications</legend><div className="flex flex-wrap gap-2">{form.certificationTypes.map((certification)=><span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-900" key={certification}>{certification}<button type="button" aria-label={`Remove ${certification}`} onClick={()=>{const next=form.certificationTypes.filter(item=>item!==certification);setForm(current=>({...current,certificationTypes:next,certificationType:next[0]??"None"}))}}>×</button></span>)}</div><Select searchable label="Search or select certification" value="" options={[{label:"Select Certification",value:""},...(["Heavy Machinery","Forklift","Crane Logistics"] as const).filter(item=>!form.certificationTypes.includes(item)).map(item=>({label:item,value:item}))]} onChange={(event)=>{const certification=event.target.value as OperatorFormData["certificationTypes"][number];if(!certification||form.certificationTypes.includes(certification))return;const next=[...form.certificationTypes,certification];setForm(current=>({...current,certificationTypes:next,certificationType:next[0]}))}}/><p className="text-xs text-slate-500">Select each approved certification. Duplicate selections are prevented.</p></fieldset>

      <Select searchable clearable label="Linked User" value={form.linkedUserId} onChange={(e) => update("linkedUserId", e.target.value)} options={[{ label: "None", value: "" }, ...eligibleUsers.map((user) => ({ label: `${user.displayName} (${user.username})`, value: user.id }))]} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={requirePin ? "PIN" : "New PIN (Optional)"} type="password" inputMode="numeric" pattern="[0-9]{4}" autoComplete="new-password" required={requirePin} minLength={4} maxLength={4} value={form.pin} onChange={(e) => update("pin", e.target.value)} />
        <Input label="Confirm PIN" type="password" inputMode="numeric" pattern="[0-9]{4}" autoComplete="new-password" required={requirePin || Boolean(form.pin)} minLength={4} maxLength={4} value={form.confirmPin} onChange={(e) => update("confirmPin", e.target.value)} />
      </div>
      <p className="text-xs text-slate-500">Use exactly 4 digits. Repeated and sequential PINs are not accepted.</p>

      <Select
        label="Status"
        value={form.status}
        onChange={(e) =>
          update(
            "status",
            e.target.value as any
          )
        }
        options={[
          {
            label: "Active",
            value: "Active",
          },
          {
            label: "On Leave",
            value: "On Leave",
          },
          {
            label: "Suspended",
            value: "Suspended",
          },
        ]}
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={submission.busy}>
          {submission.busy?"Saving...":"Save Operator"}
        </Button>
      </div>
    </form>
  );
}
