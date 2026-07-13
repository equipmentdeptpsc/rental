import {
    useEffect,
    useState,
  } from "react";
  
  import type {
    EquipmentModelRecord,
  } from "../types";
  
  interface Props {
  
    editing: EquipmentModelRecord | null;
  
    onSave(
      record: EquipmentModelRecord,
    ): void;
  
    onCancel(): void;
  
  }
  
  export default function EquipmentModelForm({
  
    editing,
  
    onSave,
  
    onCancel,
  
  }: Props) {
  
    const [
  
      equipmentModel,
  
      setEquipmentModel,
  
    ] = useState("");
  
    const [
  
      description,
  
      setDescription,
  
    ] = useState("");
  
    const [
  
      active,
  
      setActive,
  
    ] = useState(true);
  
    useEffect(() => {
  
      if (editing) {
  
        setEquipmentModel(
  
          editing.equipmentModel,
  
        );
  
        setDescription(
  
          editing.description,
  
        );
  
        setActive(
  
          editing.active,
  
        );
  
      }
  
      else {
  
        setEquipmentModel("");
  
        setDescription("");
  
        setActive(true);
  
      }
  
    }, [
  
      editing,
  
    ]);
  
    function submit(
      e: React.FormEvent,
    ) {
  
      e.preventDefault();
  
      onSave({
  
        id:
  
          editing?.id ??
  
          crypto.randomUUID(),
  
        equipmentModel:
  
          equipmentModel.trim(),
  
        description:
  
          description.trim(),
  
        active,
  
        deleted:
  
          editing?.deleted ??
  
          false,
  
        deletedAt:
  
          editing?.deletedAt,
  
      });
  
    }
  
    return (
  
      <form
  
        onSubmit={submit}
  
        className="space-y-5"
  
      >
  
        <div>
  
          <label className="mb-1 block text-sm font-medium">
  
            Equipment Model
  
          </label>
  
          <input
  
            value={equipmentModel}
  
            onChange={e =>
  
              setEquipmentModel(
  
                e.target.value,
  
              )
  
            }
  
            required
  
            className="w-full rounded-lg border px-3 py-2"
  
          />
  
        </div>
  
        <div>
  
          <label className="mb-1 block text-sm font-medium">
  
            Description
  
          </label>
  
          <input
  
            value={description}
  
            onChange={e =>
  
              setDescription(
  
                e.target.value,
  
              )
  
            }
  
            required
  
            className="w-full rounded-lg border px-3 py-2"
  
          />
  
        </div>
  
        <label className="flex items-center gap-2">
  
          <input
  
            type="checkbox"
  
            checked={active}
  
            onChange={e =>
  
              setActive(
  
                e.target.checked,
  
              )
  
            }
  
          />
  
          Active
  
        </label>
  
        <div className="flex justify-end gap-2 pt-4">
  
          <button
  
            type="button"
  
            onClick={onCancel}
  
            className="rounded border px-4 py-2"
  
          >
  
            Cancel
  
          </button>
  
          <button
  
            type="submit"
  
            className="rounded bg-blue-600 px-4 py-2 text-white"
  
          >
  
            {
  
              editing
  
                ? "Update"
  
                : "Save"
  
            }
  
          </button>
  
        </div>
  
      </form>
  
    );
  
  }