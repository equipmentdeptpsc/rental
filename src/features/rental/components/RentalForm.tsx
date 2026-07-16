import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useProject } from "@/features/project/context/ProjectContext";
import {
  getRentalEquipmentLabel,
  getRentalProjectOptions,
} from "@/features/rental/utils/rentalFormOptions";

export interface RentalFormData {
  equipmentId: string;
  customerId: string;
  customer: string;
  projectId: string;
  expectedReturn: string;
}

interface Props {
  onSubmit(data: RentalFormData): void;

  initialEquipmentId?: string;

  initialProjectId?: string;

  lockEquipment?: boolean;

  lockProject?: boolean;
}

export default function RentalForm({
  onSubmit,
  initialEquipmentId,
  initialProjectId,
  lockEquipment = false,
  lockProject = false,
}: Props) {
  const { equipment } =
    useEquipment();

  const { customers } =
    useCustomer();

  const { projects } = useProject();

    const availableEquipment =
    useMemo(() => {
  
      const available =
        equipment.filter(
          e =>
            e.active !== false &&
            !e.deleted &&
            e.status ===
              "Available"
        );
  
      if (!initialEquipmentId)
        return available;
  
      const selected =
        equipment.find(
          e =>
            e.id ===
            initialEquipmentId
        );
  
      if (
        selected &&
        !available.some(
          e =>
            e.id ===
            selected.id
        )
      ) {
  
        return [
          selected,
          ...available,
        ];
  
      }
  
      return available;
  
    }, [
      equipment,
      initialEquipmentId,
    ]);

  const equipmentOptions =
    useMemo(
      () => [
        {
          value: "",
          label:
            "Select Equipment",
        },

        ...availableEquipment.map(
          (e) => ({
            value: e.id,
            label: getRentalEquipmentLabel(e),
          })
        ),
      ],
      [availableEquipment]
    );

  const customerOptions =
    useMemo(
      () => [
        {
          value: "",
          label:
            "Select Customer",
        },

        ...customers.map((c) => ({
          value: c.id,
          label:
            c.companyName,
        })),
      ],
      [customers]
    );

  const projectOptions = useMemo(
    () => [
      { value: "", label: "Select Project" },
      ...getRentalProjectOptions(projects),
    ],
    [projects]
  );

  const [form, setForm] =
    useState<RentalFormData>({
      equipmentId:
        initialEquipmentId ??
        "",

      customerId: "",
  
      customer: "",
  
      projectId: initialProjectId ?? "",
  
      expectedReturn: "",
  
    });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      equipmentId: initialEquipmentId ?? prev.equipmentId,
      projectId: initialProjectId ?? prev.projectId,
    }));
  }, [initialEquipmentId, initialProjectId]);

  function update<
    K extends keyof RentalFormData
  >(
    key: K,
    value: RentalFormData[K]
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
        if (isSubmitting) return;

        setIsSubmitting(true);
        onSubmit(form);
        setIsSubmitting(false);
      }}
    >
      <Select
        label="Equipment"
        value={
          form.equipmentId
        }
        disabled={
          lockEquipment
        }
        options={
          equipmentOptions
        }
        onChange={(e) =>
          update(
            "equipmentId",
            e.target.value
          )
        }
      />

      <Select
        label="Customer"
        value={form.customerId}
        options={
          customerOptions
        }
        onChange={(e) =>
          {
            const customer = customers.find(
              (item) => item.id === e.target.value
            );

            update("customerId", e.target.value);
            update("customer", customer?.companyName ?? "");
          }
        }
      />

      <Select
        label="Project"
        value={form.projectId}
        disabled={lockProject}
        options={projectOptions}
        onChange={(e) =>
          update(
            "projectId",
            e.target.value
          )
        }
      />

      {projectOptions.length === 1 && (
        <p className="text-sm text-slate-500">
          No active projects are available. Create or activate a project before creating a rental.
        </p>
      )}

      <Input
        type="date"
        label="Expected Return"
        value={
          form.expectedReturn
        }
        onChange={(e) =>
          update(
            "expectedReturn",
            e.target.value
          )
        }
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          Save Rental
        </Button>
      </div>
    </form>
  );
}
