import { useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Link } from "react-router-dom";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { getProjectCustomerOptions, validateProjectCustomer } from "../services/projectCustomerService";
import { useFormSubmission } from "@/components/form/useFormSubmission";

export interface ProjectFormData {
  projectCode: string;
  projectName: string;
  customerId: string;
  location: string;
  projectManager: string;
  status:
    | "Planning"
    | "Active"
    | "Completed"
    | "On Hold";
}

interface Props {
  onSubmit(data: ProjectFormData): void | Promise<void>;

  initialData?: ProjectFormData;

  projectCodeReadOnly?: boolean;
}

export default function ProjectForm({
  onSubmit,
  initialData,
  projectCodeReadOnly = false,
}: Props) {
  const submission=useFormSubmission("Project",onSubmit);
  const [form, setForm] =
    useState<ProjectFormData>({
      projectCode: initialData?.projectCode ?? "",
      projectName: initialData?.projectName ?? "",
      customerId: initialData?.customerId ?? "",
      location: initialData?.location ?? "",
      projectManager: initialData?.projectManager ?? "",
      status: initialData?.status ?? "Planning",
    });

  const { customers } = useCustomer();
  const customerOptions = getProjectCustomerOptions(customers);
  const [customerError, setCustomerError] = useState("");

  function update<K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const error = validateProjectCustomer(form.customerId, customers);
        setCustomerError(error ?? "");
        if (error) return;
        void submission.submit(form);
      }}
    >
      {submission.feedback}
      <Input
        label="Project Code"
        value={form.projectCode}
        readOnly={projectCodeReadOnly}
        onChange={(e) =>
          update("projectCode", e.target.value)
        }
      />

      <Input
        label="Project Name"
        value={form.projectName}
        onChange={(e) =>
          update("projectName", e.target.value)
        }
      />

      <Select
        searchable clearable
        label="Customer"
        value={form.customerId}
        options={[{ value: "", label: customerOptions.length ? "Select Customer" : "No active customers available" }, ...customerOptions]}
        error={customerError}
        onChange={(e) => update("customerId", e.target.value)}
      />

      {!customerOptions.length && <p className="text-sm text-slate-500">Create an active customer before creating a project. <Link className="text-blue-600 underline" to="/customers/new">Create Customer</Link></p>}

      <Input
        label="Location"
        value={form.location}
        onChange={(e) =>
          update("location", e.target.value)
        }
      />

      <Input
        label="Project Manager"
        value={form.projectManager}
        onChange={(e) =>
          update(
            "projectManager",
            e.target.value
          )
        }
      />

      <Select
        label="Status"
        value={form.status}
        options={[
          {
            value: "Planning",
            label: "Planning",
          },
          {
            value: "Active",
            label: "Active",
          },
          {
            value: "Completed",
            label: "Completed",
          },
          {
            value: "On Hold",
            label: "On Hold",
          },
        ]}
        onChange={(e) =>
          update(
            "status",
            e.target
              .value as ProjectFormData["status"]
          )
        }
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={submission.busy}>
          {submission.busy?"Saving...":"Save Project"}
        </Button>
      </div>
    </form>
  );
}
