import {
    useEffect,
    useState,
  } from "react";
  
  import {
    MasterFormActions,
  } from "@/components/master-data";
  
  import type {
    EquipmentTypeRecord,
  } from "../types";
  
  interface Props {
  
    editing?: EquipmentTypeRecord | null;
  
    onSave(
      record: EquipmentTypeRecord,
    ): void;
  
    onCancel(): void;
  
  }
  
  const EMPTY_FORM: EquipmentTypeRecord = {
  
    id: "",
  
    equipmentType: "",
  
    description: "",
  
    active: true,
  
    deleted: false,
  
  };
  
  export default function EquipmentTypeForm({
  
    editing,
  
    onSave,
  
    onCancel,
  
  }: Props) {
  
    const [
  
      form,
  
      setForm,
  
    ] =
      useState<EquipmentTypeRecord>(
        EMPTY_FORM,
      );
  
    useEffect(() => {
  
      if (editing) {
  
        setForm(editing);
  
      }
  
      else {
  
        setForm(EMPTY_FORM);
  
      }
  
    }, [editing]);
  
    function save() {
  
      if (
  
        !form.equipmentType.trim()
  
      ) {
  
        alert(
  
          "Equipment Type is required.",
  
        );
  
        return;
  
      }
  
      if (
  
        !form.description.trim()
  
      ) {
  
        alert(
  
          "Description is required.",
  
        );
  
        return;
  
      }
  
      onSave({
  
        ...form,
  
        equipmentType:
  
          form.equipmentType.trim(),
  
        description:
  
          form.description.trim(),
  
        id:
  
          form.id ||
  
          crypto.randomUUID(),
  
      });
  
    }
  
    return (
  
      <div className="space-y-5">
  
        <div className="grid gap-4 md:grid-cols-2">
  
          <div>
  
            <label className="text-sm font-medium">
  
              Equipment Type
  
            </label>
  
            <input
  
              className="mt-1 w-full rounded border px-3 py-2"
  
              value={form.equipmentType}
  
              onChange={(event) =>
  
                setForm({
  
                  ...form,
  
                  equipmentType:
  
                    event.target.value,
  
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
  
              onChange={(event) =>
  
                setForm({
  
                  ...form,
  
                  description:
  
                    event.target.value,
  
                })
  
              }
  
            />
  
          </div>
  
        </div>
  
        <label className="flex items-center gap-2">
  
          <input
  
            type="checkbox"
  
            checked={form.active}
  
            onChange={(event) =>
  
              setForm({
  
                ...form,
  
                active:
  
                  event.target.checked,
  
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