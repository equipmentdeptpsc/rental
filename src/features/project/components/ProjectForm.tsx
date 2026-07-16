import { useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export interface ProjectFormData {
  projectCode: string;
  projectName: string;
  client: string;
  location: string;
  projectManager: string;
  startDate: string;
  targetCompletion: string;
  status:
    | "Planning"
    | "Active"
    | "Completed"
    | "On Hold";
}

interface Props {
  onSubmit(data: ProjectFormData): void;

  initialData?: ProjectFormData;

  projectCodeReadOnly?: boolean;
}

export default function ProjectForm({
  onSubmit,
  initialData,
  projectCodeReadOnly = false,
}: Props) {
  const [form, setForm] =
    useState<ProjectFormData>({
      projectCode: initialData?.projectCode ?? "",
      projectName: initialData?.projectName ?? "",
      client: initialData?.client ?? "",
      location: initialData?.location ?? "",
      projectManager: initialData?.projectManager ?? "",
      startDate: initialData?.startDate ?? "",
      targetCompletion: initialData?.targetCompletion ?? "",
      status: initialData?.status ?? "Planning",
    });

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
        onSubmit(form);
      }}
    >
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

      <Input
        label="Client"
        value={form.client}
        onChange={(e) =>
          update("client", e.target.value)
        }
      />

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

      <Input
        type="date"
        label="Start Date"
        value={form.startDate}
        onChange={(e) =>
          update(
            "startDate",
            e.target.value
          )
        }
      />

      <Input
        type="date"
        label="Target Completion"
        value={form.targetCompletion}
        onChange={(e) =>
          update(
            "targetCompletion",
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
        <Button type="submit">
          Save Project
        </Button>
      </div>
    </form>
  );
}
