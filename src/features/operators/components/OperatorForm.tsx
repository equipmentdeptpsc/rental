import { useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

import type { Operator } from "../types";

export interface OperatorFormData {
  name: string;
  email: string;
  licenseNumber: string;
  certificationType:
    | "Heavy Machinery"
    | "Forklift"
    | "Crane Logistics"
    | "None";
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

  onSubmit(
    data: OperatorFormData
  ): void;
}

export default function OperatorForm({
  initialData,
  initialLinkedUserId,
  eligibleUsers = [],
  requirePin = false,
  onSubmit,
}: Props) {
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
    onSubmit(form);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
    >
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

      <Select
        label="Certification"
        value={
          form.certificationType
        }
        onChange={(e) =>
          update(
            "certificationType",
            e.target.value as any
          )
        }
        options={[
          {
            label: "Heavy Machinery",
            value:
              "Heavy Machinery",
          },
          {
            label: "Forklift",
            value: "Forklift",
          },
          {
            label:
              "Crane Logistics",
            value:
              "Crane Logistics",
          },
          {
            label: "None",
            value: "None",
          },
        ]}
      />

      <Select label="Linked User" value={form.linkedUserId} onChange={(e) => update("linkedUserId", e.target.value)} options={[{ label: "None", value: "" }, ...eligibleUsers.map((user) => ({ label: `${user.displayName} (${user.username})`, value: user.id }))]} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={requirePin ? "PIN" : "New PIN (Optional)"} type="password" inputMode="numeric" autoComplete="new-password" required={requirePin} minLength={4} maxLength={6} value={form.pin} onChange={(e) => update("pin", e.target.value)} />
        <Input label="Confirm PIN" type="password" inputMode="numeric" autoComplete="new-password" required={requirePin || Boolean(form.pin)} minLength={4} maxLength={6} value={form.confirmPin} onChange={(e) => update("confirmPin", e.target.value)} />
      </div>
      <p className="text-xs text-slate-500">Use 4–6 digits. Repeated and sequential PINs are not accepted.</p>

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
        <Button type="submit">
          Save Operator
        </Button>
      </div>
    </form>
  );
}
