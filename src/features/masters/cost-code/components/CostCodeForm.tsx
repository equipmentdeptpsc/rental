import {
    useEffect,
    useState,
  } from "react";
  
  import type {
    CostCodeRecord,
    CostUnit,
  } from "../types";
  
  import {
    MasterFormActions,
  } from "@/components/master-data";
  
  interface Props {
  
    editing?: CostCodeRecord | null;
  
    onSave(
      record: CostCodeRecord
    ): void;
  
    onCancel(): void;
  
  }
  
  const EMPTY_FORM: CostCodeRecord = {
  
    id: "",
  
    code: "",
  
    description: "",
  
    defaultRate: 0,
  
    unit: "Hour",
  
    active: true,
  
    deleted: false,
  
  };
  
  export default function CostCodeForm({
  
    editing,
  
    onSave,
  
    onCancel,
  
  }: Props) {
  
    const [
  
      form,
  
      setForm,
  
    ] = useState(EMPTY_FORM);
  
    useEffect(() => {
  
      if (editing) {
  
        setForm(editing);
  
      } else {
  
        setForm(EMPTY_FORM);
  
      }
  
    }, [editing]);
  
    function save() {
  
      if (!form.code.trim()) {
  
        alert("Cost Code is required.");
  
        return;
  
      }
  
      if (!form.description.trim()) {
  
        alert("Description is required.");
  
        return;
  
      }
  
      onSave({
  
        ...form,
  
        id:
          form.id ||
          crypto.randomUUID(),
  
      });
  
    }
  
    return (
  
      <div className="rounded-xl border bg-white p-6 space-y-4">
  
        <h2 className="text-lg font-semibold">
  
          {editing
            ? "Edit Cost Code"
            : "New Cost Code"}
  
        </h2>
  
        <div className="grid gap-4 md:grid-cols-2">
  
          <div>
  
            <label className="text-sm font-medium">
  
              Cost Code
  
            </label>
  
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.code}
              onChange={(e) =>
                setForm({
                  ...form,
                  code: e.target.value,
                })
              }
            />
  
          </div>
  
          <div>
  
            <label className="text-sm font-medium">
  
              Description
  
            </label>
  
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description:
                    e.target.value,
                })
              }
            />
  
          </div>
  
          <div>
  
            <label className="text-sm font-medium">
  
              Default Rate
  
            </label>
  
            <input
              type="number"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.defaultRate}
              onChange={(e) =>
                setForm({
                  ...form,
                  defaultRate:
                    Number(
                      e.target.value
                    ),
                })
              }
            />
  
          </div>
  
          <div>
  
            <label className="text-sm font-medium">
  
              Unit
  
            </label>
  
            <select
  className="mt-1 w-full rounded border px-3 py-2"
  value={form.unit}
  onChange={(e) =>
    setForm({
      ...form,
      unit: e.target.value as CostUnit,
    })
  }
>
  <option value="Hour">Hour</option>

  <option value="Day">Day</option>

  <option value="Month">Month</option>

  <option value="Trip">Trip</option>

  <option value="Lot">Lot</option>

  <option value="Kilometer">Kilometer</option>

  <option value="Cubic Meter">Cubic Meter</option>

  <option value="Ton">Ton</option>

</select>
  
          </div>
  
        </div>
  
        <label className="flex items-center gap-2">
  
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) =>
              setForm({
                ...form,
                active:
                  e.target.checked,
              })
            }
          />
  
          Active
  
        </label>
  
        <MasterFormActions
  
          isEditing={!!editing}
  
          onSave={save}
  
          onCancel={onCancel}
  
        />
  
      </div>
  
    );
  
  }