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
  linkedLoginName: string;
}

interface Props {
  initialData?: Operator;
  initialLinkedLoginName?: string;

  onSubmit(
    data: OperatorFormData
  ): void;
}

export default function OperatorForm({
  initialData,
  initialLinkedLoginName,
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
      linkedLoginName: initialLinkedLoginName ?? "",
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
        value={form.name}
        onChange={(e) =>
          update(
            "name",
            e.target.value
          )
        }
      />

      <Input
        label="Email"
        value={form.email}
        onChange={(e) =>
          update(
            "email",
            e.target.value
          )
        }
      />

      <Input
        label="License Number"
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

      <Input
        label="Linked Local UAT Operator Login Name"
        value={form.linkedLoginName}
        onChange={(e) => update("linkedLoginName", e.target.value)}
      />
      <p className="text-xs text-slate-500">
        Enter the exact name used on the local Login page with the Operator role.
      </p>

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
