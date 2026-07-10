import { useEffect, useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

import type {
  PrefixRecord,
  EquipmentCategory,
} from "../types";

interface Props {
  initialData?: PrefixRecord | null;

  onSave(
    data: Omit<PrefixRecord, "id">
  ): void;

  onCancel(): void;
}

export default function PrefixForm({
  initialData,
  onSave,
  onCancel,
}: Props) {
  const [category, setCategory] =
    useState<EquipmentCategory>(
      "Moving Equipment"
    );

  const [code, setCode] =
    useState("");

  const [description,
    setDescription] =
    useState("");

  const [digits, setDigits] =
    useState("3");

  const [
    nextNumber,
    setNextNumber,
  ] = useState("1");

  const [active, setActive] =
    useState(true);

  useEffect(() => {
    if (!initialData) return;

    setCategory(
      initialData.category ??
        "Moving Equipment"
    );

    setCode(initialData.code);

    setDescription(
      initialData.description
    );

    setDigits(
      String(initialData.digits)
    );

    setNextNumber(
      String(initialData.nextNumber)
    );

    setActive(initialData.active);
  }, [initialData]);

  function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    onSave({
      category,

      code: code
        .trim()
        .toUpperCase(),

      description:
        description.trim(),

      digits: Number(digits),

      nextNumber:
        Number(nextNumber),

      active,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-lg border bg-white p-6"
    >
      <div className="grid grid-cols-2 gap-4">

        <Select
          label="Equipment Category"
          value={category}
          options={[
            {
              label:
                "Moving Equipment",
              value:
                "Moving Equipment",
            },
            {
              label:
                "Non-Moving Equipment",
              value:
                "Non-Moving Equipment",
            },
            {
              label:
                "Aerial Equipment",
              value:
                "Aerial Equipment",
            },
            {
              label:
                "Light Equipment",
              value:
                "Light Equipment",
            },
          ]}
          onChange={(e) =>
            setCategory(
              e.target
                .value as EquipmentCategory
            )
          }
        />

        <Input
          label="Prefix Code"
          maxLength={4}
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value.toUpperCase()
            )
          }
        />

        <Input
          label="Description"
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
        />

        <Input
          label="Digits"
          type="number"
          value={digits}
          onChange={(e) =>
            setDigits(
              e.target.value
            )
          }
        />

        <Input
          label="Next Number"
          type="number"
          value={nextNumber}
          onChange={(e) =>
            setNextNumber(
              e.target.value
            )
          }
        />

      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) =>
            setActive(
              e.target.checked
            )
          }
        />

        Active Prefix
      </label>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
        >
          Cancel
        </Button>

        <Button type="submit">
          {initialData
            ? "Update Prefix"
            : "Create Prefix"}
        </Button>
      </div>
    </form>
  );
}