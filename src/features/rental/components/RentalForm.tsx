import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import {
  getRentalEquipmentLabel,
  getRentalProjectOptions,
} from "@/features/rental/utils/rentalFormOptions";
import { localCalendarDate, validateNewRentalDates } from "@/features/rental/utils/rentalDateValidation";
import { rentalBillingMethods, rentalTypes, type RentalBillingMethod, type RentalType } from "@/features/rental/types";

export interface RentalFormData {
  equipmentId: string;
  customerId: string;
  customer: string;
  operatorId: string;
  projectId: string;
  dateOut: string;
  expectedReturn?: string;
  rentalType: RentalType | "";
  billingMethod: RentalBillingMethod | "";
}

interface Props {
  onSubmit(data: RentalFormData): void;

  initialEquipmentId?: string;

  initialProjectId?: string;

  initialOperatorId?: string;

  lockEquipment?: boolean;

  lockOperator?: boolean;

  initialProjectWarning?: string;
}

export default function RentalForm({
  onSubmit,
  initialEquipmentId,
  initialProjectId,
  initialOperatorId,
  lockEquipment = false,
  lockOperator = false,
  initialProjectWarning,
}: Props) {
  const { equipment } =
    useEquipment();

  const { customers } =
    useCustomer();

  const { projects } = useProject();
  const { operators } = useOperator();

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

  const operatorOptions = useMemo(() => {
    const available = operators.filter((operator) => operator.status === "Active");
    const selected = initialOperatorId ? operators.find((operator) => operator.id === initialOperatorId) : undefined;
    const choices = selected && !available.some((operator) => operator.id === selected.id)
      ? [selected, ...available]
      : available;
    return [{ value: "", label: "Select Operator" }, ...choices.map((operator) => ({ value: operator.id, label: operator.name }))];
  }, [initialOperatorId, operators]);

  const [form, setForm] =
    useState<RentalFormData>({
      equipmentId:
        initialEquipmentId ??
        "",

      customerId: "",
  
      customer: "",
      operatorId: initialOperatorId ?? "",
  
      projectId: initialProjectId ?? "",
      dateOut: localCalendarDate(),
  
      expectedReturn: "",
      rentalType: "",
      billingMethod: "",
  
    });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      equipmentId: initialEquipmentId ?? prev.equipmentId,
      projectId: initialProjectId && !prev.projectId ? initialProjectId : prev.projectId,
      operatorId: initialOperatorId ?? prev.operatorId,
    }));
  }, [initialEquipmentId, initialProjectId, initialOperatorId]);

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

        const dateError = validateNewRentalDates(form.dateOut, form.expectedReturn);
        if (dateError) {
          window.alert(dateError);
          return;
        }

        setIsSubmitting(true);
        onSubmit({ ...form, expectedReturn: form.expectedReturn || undefined });
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
          options={projectOptions}
          onChange={(e) => update("projectId", e.target.value)}
      />

      <Select
        label="Operator"
        value={form.operatorId}
        disabled={lockOperator}
        options={operatorOptions}
        onChange={(e) => update("operatorId", e.target.value)}
      />

      <Select
        label="Rental Type"
        value={form.rentalType}
        options={[{ value: "", label: "Select Rental Type" }, ...rentalTypes.map((value) => ({ value, label: value }))]}
        onChange={(e) => update("rentalType", e.target.value as RentalFormData["rentalType"])}
      />

      <Select
        label="Billing Method"
        value={form.billingMethod}
        options={[{ value: "", label: "Select Billing Method" }, ...rentalBillingMethods.map((value) => ({ value, label: value }))]}
        onChange={(e) => update("billingMethod", e.target.value as RentalFormData["billingMethod"])}
      />

      {lockOperator && <p className="text-sm text-slate-500">Operator is inherited from the selected assignment.</p>}

      {initialProjectWarning && <p className="text-sm text-amber-700">The assignment’s project is unavailable or inactive. Select another active project.</p>}

      {projectOptions.length === 1 && (
        <p className="text-sm text-slate-500">
          No active projects are available. Create or activate a project before creating a rental.
        </p>
      )}

      <Input
        type="date"
        label="Rental Start Date"
        min={localCalendarDate()}
        value={form.dateOut}
        onChange={(e) => {
          const dateOut = e.target.value;
          setForm((prev) => ({
            ...prev,
            dateOut,
            expectedReturn: prev.expectedReturn && prev.expectedReturn < dateOut ? "" : prev.expectedReturn,
          }));
        }}
      />

      <Input
        type="date"
        label="Expected Return"
        min={form.dateOut || localCalendarDate()}
        value={
          form.expectedReturn ?? ""
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
